# COEMIO public availability monitor

This repository checks COEMIO's public readiness endpoint once an hour using a standard GitHub-hosted runner. The endpoint includes the application's own backup and worker readiness checks. The repository contains no database connection, backup archive, decryption key, or customer data. Alert delivery credentials are stored as GitHub Actions repository secrets.

The workflow sends mail to the approved operator address only when the status changes to unhealthy or returns to healthy. A labelled manual drill uses separate notification state. The monitor's notification state and alert status are public. It does not inspect private billing or security-notice queues; the existing Mac-side check handles those.

GitHub may delay or drop a scheduled run. Public repositories also have scheduled workflows disabled after 60 days without activity. This monitor writes a date-only heartbeat to its own state once a day to keep the repository active. Check workflow runs periodically and maintain the Mac-side check.

To stop the external monitor, disable `.github/workflows/monitor.yml` in GitHub Actions. Do not delete a pending notification state: compare it with the Resend delivery record before resuming, to avoid duplicate alerts.
