# Akkeris Detectifier

Scan Akkeris apps with Detectify when a new release is created!

## Required Environment Variables

| Variable          | Description                                                     |
| ----------------- | --------------------------------------------------------------- |
| AKKERIS_API       | Akkeris API endpoint                                            |
| AKKERIS_UI        | Akkeris UI endpoint                                             |
| CALLBACK_URL      | Endpoint of this app (so users can access full report details)  |
| DETECTIFY_API     | Detectify API endpoint                                          |
| DETECTIFY_API_KEY | Detectify API key                                               |

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

Once the HTTP server is available, create a new Akkeris 'released' webhook pointing to the server on each app you wish to scan. Then, when those apps are released, they will automatically be scanned with Detectify, and the status of the scan will be reported through the release status.

## Endpoints

### Incoming Released Hook

`/v1/hook/released`

Point your Akkeris `released` webhook on an app to this endpoint to initiate scans.

### Web Pages

#### Current Scans

`/`

Display a list of currently running scans and some basic information about each one.

#### Error Details

`/errors/:errorID`

Get details on what went wrong with a scan. Linked to from a release status if something unexpected happened (i.e. 500 reponse from Detectify)

#### Scan Report

`/reports/:profileID`

Display full details on a given scan. Linked to from a release status when the scan is finished.

### JSON Data

#### Scan Profile

`/v1/profiles/:profileID`

Get profile information from the database for a given profile ID

#### Full Report

`/v1/reports/:profileID`

Get the full scan report from Detectify as a JSON. Please note that this will not be available for every scan profile.

### Incoming Webhook

Incoming Webhook - /v1/hook/released






