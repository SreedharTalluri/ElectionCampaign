# Election campaign site

## Local development

The server requires a PostgreSQL database. Create a database, install the Node.js dependencies, and set `DATABASE_URL` before starting the server:

```powershell
npm install
$env:DATABASE_URL = "postgresql://USER:PASSWORD@HOST:5432/DATABASE"
$env:ADMIN_TOKEN = "use-a-long-random-secret"
npm start
```

The server creates the `local_problems` table on startup. Keep database credentials and the admin token out of source control.

## Render deployment

Deploy the Blueprint in `render.yaml`. It provisions the Node web service and a free PostgreSQL database, and prompts for `ADMIN_TOKEN`. The admin token is required to edit problem details, assign an MLA, or delete problems; submissions and viewing remain public.

Problem reports can include a mobile number and email address. These contact details are optional, but any details submitted are visible to all visitors. Administrators can assign a report to an MLA by entering the MLA's name in the report editor.

Render's free PostgreSQL plan is temporary and is not suitable for long-term data retention. For durable storage, upgrade the database to a paid Render PostgreSQL plan or use another persistent PostgreSQL provider and set the service's `DATABASE_URL` environment variable to its connection string.

The tracking page migrates existing browser-saved problems to PostgreSQL when it first loads. Database records are shared by all visitors.
