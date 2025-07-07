# Metabase Extensions

This document describes three opt-in features added to Metabase:

1. **Pluggable SSO** - OAuth2/OIDC/SAML authentication
2. **Custom Branding** - Logo, colors, and brand name customization  
3. **Fine-grained Permissions** - User and group-based resource permissions

All features are fully opt-in and Metabase runs unmodified if no configuration files are present.

## 1. Pluggable SSO

Enable single sign-on with any OAuth2/OIDC provider (Google, Okta, Auth0, Azure AD, etc.).

### Configuration

Create `/app/config/sso.json`:

```json
{
  "provider": "okta",
  "client_id": "your-client-id",
  "client_secret": "your-client-secret", 
  "auth_url": "https://your-domain.okta.com/oauth2/v1/authorize",
  "token_url": "https://your-domain.okta.com/oauth2/v1/token",
  "userinfo_url": "https://your-domain.okta.com/oauth2/v1/userinfo",
  "scopes": ["openid", "email", "profile"],
  "default_group": "Viewers"
}
```

### Provider Examples

#### Google OAuth2
```json
{
  "provider": "google",
  "client_id": "your-google-client-id",
  "client_secret": "your-google-client-secret",
  "auth_url": "https://accounts.google.com/o/oauth2/v2/auth",
  "token_url": "https://oauth2.googleapis.com/token", 
  "userinfo_url": "https://www.googleapis.com/oauth2/v2/userinfo",
  "scopes": ["openid", "email", "profile"],
  "default_group": "All Users"
}
```

#### Okta
```json
{
  "provider": "okta",
  "client_id": "your-okta-client-id",
  "client_secret": "your-okta-client-secret",
  "auth_url": "https://your-domain.okta.com/oauth2/v1/authorize",
  "token_url": "https://your-domain.okta.com/oauth2/v1/token",
  "userinfo_url": "https://your-domain.okta.com/oauth2/v1/userinfo", 
  "scopes": ["openid", "email", "profile"],
  "default_group": "Viewers"
}
```

#### Auth0
```json
{
  "provider": "auth0",
  "client_id": "your-auth0-client-id",
  "client_secret": "your-auth0-client-secret",
  "auth_url": "https://your-domain.auth0.com/authorize",
  "token_url": "https://your-domain.auth0.com/oauth/token",
  "userinfo_url": "https://your-domain.auth0.com/userinfo",
  "scopes": ["openid", "email", "profile"],
  "default_group": "Viewers"
}
```

### How it Works

1. **Login Flow**: Users see "Sign in with [Provider]" button on login page
2. **Authentication**: Redirects to provider's auth URL with OAuth2 parameters
3. **Callback**: Provider redirects back to `/api/sso/callback` with authorization code
4. **Token Exchange**: Backend exchanges code for access token
5. **User Info**: Fetches user profile from provider's userinfo endpoint
6. **User Creation**: Auto-creates Metabase user if they don't exist
7. **Group Assignment**: Assigns user to the configured default group

### API Endpoints

- `GET /api/sso/login` - Initiate SSO login flow
- `GET /api/sso/callback` - Handle OAuth2 callback
- `GET /api/sso/config` - Get SSO configuration for frontend

## 2. Custom Branding

Customize Metabase's appearance with your organization's branding.

### Configuration

Create `/app/config/branding.json`:

```json
{
  "logo_url": "https://cdn.acme.com/logo.svg",
  "favicon_url": "https://cdn.acme.com/favicon.ico", 
  "brand_name": "Acme Analytics",
  "primary_color": "#0055aa"
}
```

### Configuration Options

| Field | Description | Example |
|-------|-------------|---------|
| `logo_url` | URL to your logo image (SVG, PNG recommended) | `"https://cdn.acme.com/logo.svg"` |
| `favicon_url` | URL to your favicon | `"https://cdn.acme.com/favicon.ico"` |
| `brand_name` | Organization name shown in UI | `"Acme Analytics"` |
| `primary_color` | Primary theme color (hex) | `"#0055aa"` |

### How it Works

1. **Configuration Loading**: Backend loads branding config on startup
2. **API Endpoint**: Frontend fetches branding via `/api/branding`
3. **Application**: Frontend applies branding to login page, header, favicon
4. **CSS Variables**: Primary color is applied via CSS custom properties

### API Endpoints

- `GET /api/branding` - Get branding configuration

## 3. Fine-grained Permissions

Control user access to dashboards, questions, and collections with granular permissions.

### Configuration

Create `/app/config/permissions.json`:

```json
{
  "groups": {
    "Analysts": {
      "view": ["Sales Dashboard", "Product Dashboard"],
      "edit": ["Product Dashboard"]
    },
    "Executives": {
      "view": ["Sales Dashboard", "Executive Summary"],
      "edit": []
    },
    "Admins": {
      "view": ["All"],
      "edit": ["All"]
    }
  },
  "users": {
    "vip@company.com": {
      "view": ["All"],
      "edit": ["All"]
    },
    "readonly@company.com": {
      "view": ["Sales Dashboard"],
      "edit": []
    }
  }
}
```

### Permission Types

- **view**: Can view/read the resource
- **edit**: Can modify/update the resource

### Special Values

- `"All"`: Access to all resources
- `[]`: No access (empty array)

### How it Works

1. **Permission Resolution**: User permissions = user-specific + group-based permissions
2. **Middleware**: API requests are intercepted and checked against permissions
3. **Filtering**: Lists of resources are filtered based on user permissions
4. **Access Control**: 403 errors returned for unauthorized access attempts

### Permission Enforcement

The system enforces permissions on:

- Dashboard viewing and editing
- Question/Card viewing and editing  
- Collection access
- API endpoints matching `/api/dashboard/*`, `/api/card/*`, `/api/collection/*`

## Docker Deployment

### Basic Setup

```dockerfile
FROM metabase/metabase:latest

# Copy configuration files
COPY config/ /app/config/

# Make sure config directory is readable
RUN chmod -R 644 /app/config/
```

### Docker Compose Example

```yaml
version: '3.8'
services:
  metabase:
    image: your-org/metabase-extended:latest
    ports:
      - "3000:3000"
    volumes:
      - ./config:/app/config:ro
      - metabase-data:/metabase.db
    environment:
      - MB_DB_TYPE=postgres
      - MB_DB_DBNAME=metabase
      - MB_DB_PORT=5432
      - MB_DB_USER=metabase
      - MB_DB_PASS=password
      - MB_DB_HOST=postgres
    depends_on:
      - postgres

  postgres:
    image: postgres:13
    environment:
      - POSTGRES_DB=metabase
      - POSTGRES_USER=metabase
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres-data:/var/lib/postgresql/data

volumes:
  metabase-data:
  postgres-data:
```

### Configuration Volume Mount

```bash
# Create config directory
mkdir -p ./config

# Copy example configurations
cp app/config/*.example ./config/

# Edit configurations
vim ./config/sso.json
vim ./config/branding.json  
vim ./config/permissions.json

# Run with mounted config
docker run -d \
  -p 3000:3000 \
  -v $(pwd)/config:/app/config:ro \
  your-org/metabase-extended:latest
```

## Development and Testing

### Reloading Configuration

During development, you can reload configurations without restarting:

```clojure
;; In REPL
(require '[metabase.sso.config :as sso.config])
(require '[metabase.branding.config :as branding.config])
(require '[metabase.permissions.config :as perms.config])

;; Reload configurations
(sso.config/reload-sso-config!)
(branding.config/reload-branding-config!)
(perms.config/reload-permissions-config!)
```

### Testing SSO Integration

1. Set up OAuth2 application in your provider
2. Configure redirect URI: `http://localhost:3000/api/sso/callback`
3. Update `sso.json` with your provider details
4. Restart Metabase
5. Navigate to login page - should see SSO button

### Testing Branding

1. Create `branding.json` with your URLs
2. Restart Metabase
3. Check login page for logo/branding changes
4. Verify favicon and page title updates

### Testing Permissions

1. Create test users and groups in Metabase admin
2. Create test dashboards with specific names
3. Configure `permissions.json` with test permissions
4. Login as different users to verify access control

## Security Considerations

### SSO Security

- Use HTTPS for all OAuth2 URLs
- Store client secrets securely (consider environment variables)
- Validate redirect URIs
- Implement proper CSRF protection

### Configuration Security

- Protect config files with appropriate file permissions
- Use secrets management for sensitive values
- Rotate credentials regularly
- Monitor configuration access

### Permissions Security

- Follow principle of least privilege
- Regularly audit permission assignments
- Test permission boundaries
- Monitor access patterns

## Troubleshooting

### SSO Issues

1. **SSO button not appearing**: Check `sso.json` exists and is valid JSON
2. **OAuth2 errors**: Verify client ID, secret, and redirect URI configuration
3. **User not created**: Check default group exists and auto-creation settings
4. **Token errors**: Verify token URL and credentials

### Branding Issues

1. **Branding not applied**: Check `branding.json` exists and API returns config
2. **Images not loading**: Verify URLs are accessible and HTTPS if required
3. **Colors not changing**: Check CSS custom property support

### Permission Issues

1. **Permissions not enforced**: Verify `permissions.json` exists and is valid
2. **User can't access resources**: Check user email matches config exactly
3. **Group permissions not working**: Verify user is in the correct Metabase group
4. **API access issues**: Check permission middleware is properly configured

## Compatibility

- Compatible with Metabase 0.48+ (adjust as needed)
- Maintains full backward compatibility
- No breaking changes to existing functionality
- All features are opt-in via configuration files

## Contributing

When contributing to these features:

1. Ensure all changes are backward compatible
2. Add appropriate tests for new functionality
3. Update documentation for any API changes
4. Follow existing code patterns and style
5. Test with configuration files both present and absent