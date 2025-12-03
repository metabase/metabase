# Keycloak SAML Test Setup

Pre-configured Keycloak instance for testing Metabase SAML authentication.

## Quick Start

```bash
cd keycloak
docker-compose up -d
```

Access Keycloak at `http://localhost:8090`

## Pre-configured Realm: `metabase`

### Admin Console
- **URL**: `http://localhost:8090/admin`
- **Username**: `admin`
- **Password**: `admin`

### Test Users

| Username | Email | Password | Name |
|----------|-------|----------|------|
| `admin` | `admin@metabase.test` | `admin123` | Admin User |
| `testuser` | `testuser@metabase.test` | `test123` | Test User |

### SAML Client: `Metabase`

Pre-configured with:
- **Protocol**: SAML 2.0
- **Client ID / Entity ID**: `Metabase`
- **Name ID Format**: Email
- **Signature Algorithm**: RSA_SHA256
- **Redirect URIs**: `http://localhost:3000/auth/sso*`, `http://localhost:8080/auth/sso*`, `http://metabase.localhost:3000/auth/sso*`

**Attribute Mappings**:
- Email → `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress`
- First Name → `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname`
- Last Name → `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname`

## Configure Metabase

1. **Download SAML Certificate**:
   - Go to `http://localhost:8090/admin` and login with `admin` / `admin`
   - Select the **metabase** realm from the dropdown (top-left)
   - Navigate to **Realm settings** → **Keys** tab
   - Find the RSA key with algorithm "RS256"
   - Click the **Certificate** button and copy the certificate text

2. **Configure in Metabase** (Admin → Settings → Authentication → SAML):
   - **SAML Identity Provider URL**: `http://localhost:8090/realms/metabase/protocol/saml`
   - **SAML Identity Provider Certificate**: Paste the certificate from step 1
   - **SAML Identity Provider Issuer**: `http://localhost:8090/realms/metabase`
   - **SAML Application Name**: `Metabase` (must match the client ID)
   - Enable SAML and save

3. **Test**: Navigate to Metabase login and click "Sign in with SSO" to try SAML authentication with test users

## Important Notes

- **Certificate must be refreshed** after each `docker-compose down && up` since Keycloak generates a new one
- If you get "Invalid Request" errors, ensure your Metabase site-url matches one of the configured redirect URIs
- Current redirect URIs support: `localhost:3000`, `localhost:8080`, and `metabase.localhost:3000`

## SAML Endpoints

- **Metadata**: `http://localhost:8090/realms/metabase/protocol/saml/descriptor`
- **SSO URL**: `http://localhost:8090/realms/metabase/protocol/saml`

## Troubleshooting

- **"Invalid redirect uri"**: Your Metabase site-url doesn't match the configured redirect URIs. Add your URL to `redirectUris` in `metabase-realm.json`
- **"Invalid Request"**: Entity ID mismatch. Ensure SAML Application Name in Metabase is set to `Metabase`
- **"Cannot_match_source_hash"**: Keycloak can't find the client. Check that the client ID is `Metabase` in the realm config
