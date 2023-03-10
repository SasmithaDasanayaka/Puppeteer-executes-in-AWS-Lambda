
const chromium = require('chrome-aws-lambda');
const needle = require('needle');
const AWS = require('aws-sdk');
const csv = require('csvtojson')

const handler = async (event) => {
    const signedUrl = event.signedUrl;

    console.log(`signedUrl: ${signedUrl}`);

    let pdfBufferData;
    let webSiteDomain = '';
    let pdfUrlPath = '';
    let newDownloadblePdfUrl = '';

    const bucket = "<Bucket Name Here>";;
    const viewInvoiceBtnTitlesCsvkey = "<CSV key Here>";
    const params1 = { Bucket: bucket, Key: viewInvoiceBtnTitlesCsvkey };

    const downloadInvoiceBtnTitlesCsvkey = "<CSV key Here>";
    const params2 = { Bucket: bucket, Key: downloadInvoiceBtnTitlesCsvkey };

    const s3 = new AWS.S3();
    const stream1 = s3.getObject(params1).createReadStream();
    const json1 = await csv().fromStream(stream1);

    const stream2 = s3.getObject(params2).createReadStream();
    const json2 = await csv().fromStream(stream2);

    const VIEW_EMAIL_INVOICE_BTN_XMLS = json1.map(obj => Object.values(obj)[0]);
    const DOWNLOAD_INVOICE_BTN_XMLS = json2.map(obj => Object.values(obj)[0]);

    console.log(`Retried all s3 csv files 1 : ${VIEW_EMAIL_INVOICE_BTN_XMLS}`)
    console.log(`Retried all s3 csv files 2 : ${DOWNLOAD_INVOICE_BTN_XMLS}`)

    const PROMISE_WAIT_MILLISECONDS = 10000;

    console.log('puppeteer browser starting');
    const browser = await chromium.puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath,
        headless: false,
        ignoreHTTPSErrors: true,
    });
    console.log('puppeteer browser launched');
    try {
        const page = await browser.newPage();
        page.on('response', async (response) => {
            const contentType = response.headers()['content-type']?.split(';')[0];
            if (contentType === 'application/pdf') {
                console.log(`PDF link (auto download) : ${response.url()}`);
                pdfBufferData = await downloadPDF(response.url());
            }
        });
        console.log('started goto...');
        await page.goto(signedUrl, { waitUntil: 'networkidle2' });
        console.log('ended goto...');

        await new Promise(r => setTimeout(r, 2000));
        let pages = await browser.pages();
        const pageCountAfterEmailHtmlBodyLoaded = pages.length;


        for (let i = 0; i < VIEW_EMAIL_INVOICE_BTN_XMLS.length; i++) {
            let isViewEmailInvoiceBtnTitleExists = await page.$x(`${VIEW_EMAIL_INVOICE_BTN_XMLS[i]}`) || null;
            console.log(`isViewEmailInvoiceBtnTitleExists length: ${isViewEmailInvoiceBtnTitleExists.length}`);
            if (isViewEmailInvoiceBtnTitleExists.length) {
                let viewInvoiceBtn = await page.waitForXPath(`${VIEW_EMAIL_INVOICE_BTN_XMLS[i]}`);
                webSiteDomain = page.url().split('/')[2];
                pdfUrlPath = await (await viewInvoiceBtn.getProperty('href')).jsonValue();
                viewInvoiceBtn && await viewInvoiceBtn.click();
                console.log(`clicked view invoice : ${VIEW_EMAIL_INVOICE_BTN_XMLS[i]}`);
                break;
            }
        }
        await new Promise(r => setTimeout(r, PROMISE_WAIT_MILLISECONDS));

        pages = await browser.pages();
        const pageCountAfterViewBtnClicked = pages.length;
        if (pageCountAfterEmailHtmlBodyLoaded === pageCountAfterViewBtnClicked) {
            if (!pdfBufferData) {
                newDownloadblePdfUrl = pdfUrlPath.includes('http') ? pdfUrlPath : `https://${webSiteDomain}${pdfUrlPath}`;
                console.log(`newDownloadblePdfUrl : ${newDownloadblePdfUrl}`);
                pdfBufferData = await downloadPDF(newDownloadblePdfUrl);
            }
            const pdfBufferDataBody = pdfBufferData.toString('base64')
            if (pdfBufferDataBody) {
                await browser.close();
                return { body: pdfBufferDataBody };
            }
        }

        let lastPage = pages[pages.length - 1];
        console.log(`after view btn clicked # pages : ${pages.length}, ${lastPage.url()}`);

        lastPage.on('response', async (response) => {
            const contentType = response.headers()['content-type']?.split(';')[0];
            if (contentType === 'application/pdf') {
                console.log(`PDF link (auto download) : ${response.url()}`);
                pdfBufferData = await downloadPDF(response.url());
            }
        });

        for (let i = 0; i < DOWNLOAD_INVOICE_BTN_XMLS.length; i++) {
            let isDownloadEmailInvoiceBtnTitleExists = await lastPage.$x(`${DOWNLOAD_INVOICE_BTN_XMLS[i]}`) || null;
            console.log(`isDownloadEmailInvoiceBtnTitleExists length: ${isDownloadEmailInvoiceBtnTitleExists.length}`);
            if (isDownloadEmailInvoiceBtnTitleExists.length) {
                let downloadInvoiceBtn = await lastPage.waitForXPath(`${DOWNLOAD_INVOICE_BTN_XMLS[i]}`);
                webSiteDomain = lastPage.url().split('/')[2];
                pdfUrlPath = await (await downloadInvoiceBtn.getProperty('href')).jsonValue();
                downloadInvoiceBtn && await downloadInvoiceBtn.click();
                console.log(`clicked Download invoice : ${DOWNLOAD_INVOICE_BTN_XMLS[i]}`);
                break;
            }
        }

        await new Promise(r => setTimeout(r, PROMISE_WAIT_MILLISECONDS));

        pages = await browser.pages();
        const pageCountAfterDownloadBtnClicked = pages.length;
        if (pageCountAfterViewBtnClicked === pageCountAfterDownloadBtnClicked) {
            if (!pdfBufferData) {
                newDownloadblePdfUrl = pdfUrlPath.includes('http') ? pdfUrlPath : `https://${webSiteDomain}${pdfUrlPath}`;;
                console.log(`newDownloadblePdfUrl : ${newDownloadblePdfUrl}`);
                pdfBufferData = await downloadPDF(newDownloadblePdfUrl);
            }
            await browser.close();
            return { body: pdfBufferData.toString('base64') };
        }

        lastPage = pages[pages.length - 1];
        console.log(`after download btn clicked # pages : ${pages.length}, ${lastPage.url()}`);

        pages = await browser.pages();
        const pdfFileUrl = pages[pages.length - 1].url();
        pdfBufferData = await downloadPDF(pdfFileUrl);
        console.log(`PDF link (browser pdf view) ${pdfFileUrl}`);


        await new Promise(r => setTimeout(r, PROMISE_WAIT_MILLISECONDS));

        await browser.close();

        return { body: pdfBufferData.toString('base64') };
    } catch (error) {
        console.log(`error puppeteerDownloadPdfInvoice', {
            ${error}
        }`);
        await browser.close();
        return { body: "" };
    }
}

async function downloadPDF(pdfURL) {
    try {
        console.log(`started getting pdf using needle: ${pdfURL}`)
        const pdfBufferData = await needle('get', pdfURL);
        console.log("ended getting pdf using needle")
        return pdfBufferData.body;
    } catch (error) {
        console.log('downloadInvoice', {
            error: JSON.stringify(error)
        });
        throw error;
    }
}

exports.handler = handler;