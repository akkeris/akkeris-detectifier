# Akkeris Detectifier

Scan Akkeris apps with Detectify when a new release is created!

Easy usage is available via the Akkeris CLI: see the [Akkeris CLI Plugin documentation](https://github.com/octanner/akkeris-detectifier-plugin)

## Required Environment Variables

| Variable                     | Description                                                     |
| ---------------------------- | --------------------------------------------------------------- |
| AKKERIS_APP_CONTROLLER       | Akkeris app controller endpoint                                 |
| AKKERIS_SERVICE_TOKEN        | Service token for communicating with the Akkeris app controller |
| AKKERIS_UI                   | Akkeris UI endpoint                                             |
| AUTH_HOST                    | OAuth endpoint used for Akkeris authentication                  |
| CALLBACK_URL                 | Endpoint of this app (so users can access full report details)  |
| DETECTIFY_API                | Detectify API endpoint                                          |
| DETECTIFY_API_KEY            | Detectify API key                                               |

In addition, a Postgres database and an S3 bucket are required. The following environment variables provide access information to those resources:

| Variable          | Description                       |
| ----------------- | --------------------------------- |
| DATABASE_URL      | Endpoint of a Postgres database   |
| S3_ACCESS_KEY     | S3 bucket access key              |
| S3_SECRET_KEY     | S3 bucket secret key              |
| S3_BUCKET         | S3 bucket name                    |
| S3_LOCATION       | S3 bucket endpoint                |
| S3_REGION         | S3 bucket region                  |

## Optional Environment Variables

| Variable        | Description                                                                 |
| --------------- | --------------------------------------------------------------------------- |
| TIMEOUT_MINUTES | How many minutes before a scan is considered to have timed out (default 50) |

## Installation

Two instances of this application are necessary for full operation - the main HTTP server, and a worker process. 

The HTTP server is started by `npm start`.

The worker process is started by `npm run worker`.

The easiest way to get up and running is via Docker. Assuming that your environment variables are saved in `config.env`:

```shell
$ docker build -t akkeris-detectify .
$ docker run --env-file config.env -p 9000:9000 akkeris-detectify
$ docker run --env-file confiv.env akkeris-detectify npm run worker
```

## Endpoints

### Start A Scan

`POST /v1/scans/start`

Sending a request with the appropriate body and headers will start a new immediate Detectify scan on an Akkeris app.

Required Headers:
- `Authorization: Bearer ${token}` - Provide your Akkeris authorization token to use this feature (`aka token`)
- `Content-Type: application/json` - This endpoint expects a JSON payload
  
Expected Payload (JSON):
- "app_name" (string): Provide the name of the Akkeris app that you want to be scanned
- "success_threshold" (string) (optional): Provide this to customize the maximum allowable threat score for a scan to be considered "successful" (default 6)
- "site" (string) (optional): Provide this to scan a different URL than the default app endpoint

Example payload:
```json
{
  "app_name": "myapp-prod",
  "success_threshold": "6"
}
```

### Incoming Released Hook

`POST /v1/hook/released`

Point your Akkeris `released` webhook on an app to this endpoint to initiate scans.

### Site Overrides

Sometimes it is neccesary to scan a different URL than the default app endpoint. Adding a site override for an app means that any time a scan is run on the given app, it will use the site override URL instead of the default app endpoint.

Currently you can only have a single site override per app. This may change in the future (i.e. scan multiple endpoints when an app is released)

#### View All Site Overrides

`GET /v1/config`

This endpoint returns a list of all apps that have configured site overrides.

#### Add New or Update Site Override

`POST /v1/config/:appName`

or

`PATCH /v1/config/:appName`

Add a new site override for an app, or update an existing site override for an app. Either endpoint works for either function.

Expected Payload (JSON):
- `site` (string) (required): The URL to scan instead of the default app endpoint


#### Remove Site Override

`DELETE /v1/config/:appName`

This will remove the configured site override for an app.


### Web Pages

#### Current Scans

`GET /`

Display a list of currently running scans and some basic information about each one.

#### Error Details

`GET /errors/:errorID`

Get details on what went wrong with a scan. Linked to from a release status if something unexpected happened (i.e. 500 reponse from Detectify)

#### Scan Report

`GET /reports/:profileID`

Display full details on a given scan. Linked to from a release status when the scan is finished.

### JSON Data

#### Scan Profile

`GET /v1/profiles/:profileID`

Get profile information from the database for a given profile ID

#### Full Report

`GET /v1/reports/:profileID`

Get the full scan report from Detectify as a JSON. Please note that this will not be available for every scan profile.

## Credits

json-formatter-js: https://github.com/mohsen1/json-formatter-js
- `/public/json-formatter.umd.js`

Load Awesome: https://github.com/danielcardoso/load-awesome
- `/public/loadAwesomePacman.css`
