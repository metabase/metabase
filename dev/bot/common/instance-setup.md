## Instance Setup

The dev environment is pre-configured with users and API keys via `MB_CONFIG_FILE_PATH`. No manual setup or API calls are needed. The instance will auto-create these on first startup:

- **Admin user**: `admin@example.com` / `admin123` (superuser)
- **Regular user**: `regular@example.com` / `regular123`
- **Admin API key**: `mb_AdminApiKey` (admin permissions)
- **Regular API key**: `mb_RegularApiKey` (regular permissions)

Do NOT call `/api/setup` — it is already handled.
