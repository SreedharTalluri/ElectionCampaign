# Election campaign site

## Local development

The server requires a PostgreSQL database. Install dependencies, set `DATABASE_URL`, and start the server:

```powershell
npm install
$env:DATABASE_URL = "postgresql://USER:PASSWORD@HOST:5432/DATABASE"
npm start
```

Set the local admin password in the ignored `.env` file. The server loads it automatically. The server creates the `local_problems` table on startup. Never commit `.env` or database credentials.

## Render deployment

Deploy the Blueprint in `render.yaml`. It provisions the Node web service and a free PostgreSQL database, and prompts for `ADMIN_TOKEN`. If the service reports that admin access is not configured, open the web service in the Render Dashboard, go to **Environment**, add `ADMIN_TOKEN` with a long, unique secret value, then save the changes and redeploy. Click **Admin sign in** on the problem page and enter that value in the browser password prompt. The token is not displayed in the page or saved to browser storage.

The admin token is required to edit problem details, assign an MLA, or delete problems; submissions and viewing remain public.

Problem reports can include a mobile number and email address. These contact details are optional, but any details submitted are visible to all visitors. Administrators can assign a report to an MLA by entering the MLA's name in the report editor.

Render's free PostgreSQL plan is temporary and is not suitable for long-term data retention. For durable storage, upgrade the database to a paid Render PostgreSQL plan or use another persistent PostgreSQL provider and set the service's `DATABASE_URL` environment variable to its connection string.

The tracking page migrates existing browser-saved problems to PostgreSQL when it first loads. Database records are shared by all visitors.
