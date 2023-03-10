# Puppeteer-executes-in-AWS-Lambda
Execute Puppeteer in AWS Lambda. <br>
1. This Lambda will get a signed Url in the event object to retrieve the html page object in a S3 bucket. <br>
2. The Lambda will access an S3 bucket to get CSV files which includes XPaths of HTML elements. <br>
3. Puppeteer will launch a chromium instance with the chrome-aws-lambda and navigate to the html page retrived from the signed Url and then click the buttons to navigate to new pages (Buttons will be selected with the XPaths in the CSV files). <br>
4. Eventually downloads the remote pdf file using needle library and returns the downloaded pdf file as an encoded string.
