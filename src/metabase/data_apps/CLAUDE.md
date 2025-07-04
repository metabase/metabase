# Data Apps Development Guide

## Overview

This directory contains the core functionality for Metabase Data Apps - a feature that allows users to create and publish custom applications within Metabase.

## Key Components

- **core.clj** - Public API for the data apps module (all external interactions should go through this namespace)
- **models.clj** - Internal database models and schema definitions for Apps, AppDefinitions, and AppPublishing

## Data Model

### Tables and Relationships

```
app
├── id (PK)
├── name
├── url (unique)
├── created_at
└── updated_at

app_definition
├── id (PK)
├── app_id (FK -> app.id, cascade delete)
├── version (incrementing number)
├── config (JSON)
├── entity_id (SHA hash)
└── created_at

app_publishing
├── id (PK)
├── app_id (FK -> app.id, cascade delete)
├── app_definition_id (FK -> app_definition.id, cascade delete)
├── version_number (semantic version)
├── published_at
└── active (boolean, default false)
```

### Key Relationships

1. **App → AppDefinition** (1:N)
   - Each app can have multiple versioned definitions
   - Definitions are append-only (immutable once created)
   - Indexed on `app_id` for efficient queries

2. **App → AppPublishing** (1:N)
   - Each app can have multiple publishing records
   - Only one can be `active` at a time
   - Composite index on `(app_id, active)` for fast lookups

3. **AppDefinition → AppPublishing** (1:N)
   - Each definition can be published multiple times
   - Publishing records track when a definition was made active

## Development Guidelines

### Model Structure

The data apps feature uses three main models:
- `:model/App` - The main app entity with unique URL
- `:model/AppDefinition` - Immutable versioned app configurations
- `:model/AppPublishing` - Publishing records tracking active versions

### Public API (core.clj)

These functions form the public interface for the data apps module. All external code should use these functions rather than directly accessing the models:

- `create-app!` - Creates a new app with its initial definition
- `new-definition!` - Creates a new version of an app definition
- `publish!` - Publishes a specific app definition version

**Important:** Do not import or use functions from `models.clj` directly outside of this module. Always use the public API in `core.clj`.

### Database Considerations

- App definitions are versioned automatically
- Only one definition can be active/published at a time
- Validation occurs before insert/update operations

### Common Patterns

1. Always validate app definition configs before saving
2. Use transactions when updating multiple related records
3. Ensure version numbers increment properly
4. Handle publication state transitions atomically

## Maintenance

### When to Update This File

Please update this CLAUDE.md file when:

1. **Adding new models or tables** - Update the data model section
2. **Modifying database schema** - Update table structures and relationships
3. **Adding new core functions** - Add to the Key Functions section
4. **Changing validation rules** - Document in the appropriate section
5. **Introducing new patterns** - Add to Common Patterns
6. **Adding new files** - Update the Key Components section

### Files to Check for Updates

When updating this documentation, review these files for changes:
- `models.clj` - Model definitions and business logic
- `core.clj` - Core functionality
- `/resources/migrations/*_update_migrations.yaml` - Database schema changes
- Any new `.clj` files added to this directory

This ensures the documentation stays in sync with the actual implementation.
