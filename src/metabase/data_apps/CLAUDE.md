# Data Apps Development Guide

## Overview

This directory contains the core functionality for Metabase Data Apps - a feature that allows users to create and publish custom applications within Metabase.

## Key Components

- **core.clj** - Public API for the data apps module (all external interactions should go through this namespace)
- **models.clj** - Internal database models and schema definitions for Apps, AppDefinitions, and AppRelease
- **api/data-app.clj** - Admin/CRUD API endpoints under `/api/data-apps/` for managing data apps
- **api/app.clj** - Consumer API endpoints under `/api/app/` for using published data apps
- **enterprise/backend/src/metabase_enterprise/data_apps/** - Enterprise-specific features and extensions for data apps

## Data Model

### Tables and Relationships

```
data_app
├── id (PK)
├── name
├── slug (unique)
├── status (private, published, archived)
├── entity_id
├── created_at
└── updated_at

data_app_definition
├── id (PK)
├── app_id (FK -> data_app.id, cascade delete)
├── revision_number (incrementing number, calculated atomically)
├── config (JSON)
├── entity_id (char(21))
└── created_at

data_app_release
├── id (PK)
├── app_id (FK -> data_app.id, cascade delete)
├── app_definition_id (FK -> data_app_definition.id, cascade delete)
├── created_at
├── updated_at
└── retracted (boolean, default false)
```

### Key Relationships

1. **DataApp → DataAppDefinition** (1:N)
   - Each app can have multiple sequential snapshots (revisions) of its definition
   - Definitions are append-only (immutable once created)
   - Indexed on `app_id` for efficient queries
   - `revision_number` is calculated atomically to prevent race conditions

2. **DataApp → DataAppRelease** (1:N)
   - Each app can have multiple publishing records
   - Only ONE release can be active at a time (retracted = false)
   - When publishing a new release, all previous releases are automatically retracted
   - Multiple releases can exist without being retracted
   - Retracted status allows for simpler publishing and rollback

3. **DataAppDefinition → DataAppRelease** (1:N)
   - Each definition can be published multiple times
   - Release records track when a definition was published

## Development Guidelines

### Model Structure

The data apps feature uses three main models:
- `:model/DataApp` - The main app entity with unique slug (table: `data_app`)
- `:model/DataAppDefinition` - Immutable versioned app configurations (table: `data_app_definition`)
- `:model/DataAppRelease` - Release records tracking active versions (table: `data_app_release`)

### Public API (core.clj)

These functions form the public interface for the data apps module. All external code should use these functions rather than directly accessing the models:

- `create-app!` - Creates a new app with its initial definition
- `set-latest-definition!` - Creates a new version of an app definition (revision_number calculated atomically)
- `publish!` - Publishes a specific app definition version

**Important:** Do not import or use functions from `models.clj` directly outside of this module. Always use the public API in `core.clj`.

### Database Considerations

- App definitions use `revision_number` (not version) that increments atomically
- Only one release can be active per app (enforced by auto-retracting previous releases)
- Validation occurs before insert/update operations
- The `retracted` field is the only updatable field on releases (append-only design)
- Publishing automatically retracts all previous releases for that app

## API Endpoints

The data apps feature exposes two distinct sets of API endpoints:

### Admin/Management APIs (`/api/data-app/`)

Located in `api/data-apps.clj`, these endpoints support the manipulation of Data Apps by Creators.

### Consumer APIs (`/api/app/`)

Located in `api/app.clj`, these endpoints are used to run Data Apps for Consumers.

### API Design Principles

1. **Separation of Concerns**: Creator operations are clearly separated from Consumer operations
2. **Published-Only Access**: Consumer endpoints only return published app versions
3. **Permission Enforcement**: All endpoints check appropriate permissions (read/create/update/delete)
4. **Version Control**: Admin APIs handle versioning, while consumer APIs only see published versions
5. **Resource Safety**: Consumer endpoints cannot modify app definitions, only interact with them

## Testing Guidelines

### Test Utilities

Use the testing utilities in `test/metabase/data_apps/test_util.clj`:

- **`with-data-app-cleanup`** - Wraps tests that create data apps to prevent resource leakage
- **`with-data-app`** - Creates temporary data app models using `with-temp` pattern

### Testing Patterns

1. **Flow tests** for CRUD operations (create → read → update → delete in one test)
2. **Focused tests** for edge cases (validation errors, permissions, 404s)
3. **Always use cleanup macros** to prevent test data leakage between runs
4. **Use `=?` for response validation** instead of checking individual fields - more idiomatic and concise

### Common Patterns

1. Always validate app definition configs before saving
2. Use transactions when updating multiple related records
3. Revision numbers are calculated atomically using SQL (no race conditions)
4. Handle publication state transitions explicitly in transactions
5. Use `data_app` prefix for all table names for clarity

## Maintenance

### When to Update This File

Please update this CLAUDE.md file when:

1. **Adding new models or tables** - Update the data model section
2. **Modifying database schema** - Update table structures and relationships
3. **Adding new core functions** - Add to the Key Functions section
4. **Changing validation rules** - Document in the appropriate section
5. **Introducing new patterns** - Add to Common Patterns
6. **Adding new files** - Update the Key Components section
7. **Adding or modifying API endpoints** - Update the API Endpoints section

### Files to Check for Updates

When updating this documentation, review these files for changes:
- `models.clj` - Model definitions and business logic
- `core.clj` - Core functionality
- `/resources/migrations/*_update_migrations.yaml` - Database schema changes
- Any new `.clj` files added to this directory

This ensures the documentation stays in sync with the actual implementation.
