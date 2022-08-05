---
title: Encrypting your database connection details at rest
redirect_from:
  - /docs/latest/operations-guide/encrypting-database-details-at-rest
---

# Encrypting your database connection details at rest

Metabase stores connection information for the various databases you add in the [Metabase application database](/glossary/application_database). To prevent bad actors from being able to access these details if they were to gain access to the application DB, Metabase can automatically encrypt them with AES256 + SHA512 when they are saved, and decrypt them on-the-fly whenever they are needed.

- [Creating an encryption key](#creating-an-encryption-key)
  - [Example commands for creating and adding a key](#example-commands-for-creating-and-adding-a-key)
- [Encrypting an existing connection](#encrypting-an-existing-connection)
- [Rotating an encryption key](#rotating-an-encryption-key)
  - [Example command for rotating a key](#example-command-for-rotating-a-key)
- [Disabling an encryption key](#disabling-an-encryption-key)
  - [Example command for disabling a key](#example-command-for-disabling-a-key)

## Creating an encryption key

1. Generate a secret key that is at least 16 characters (longer is even better!). We recommend using a secure random key generator, such as `openssl`.
   > Take care not to lose this key because you can't decrypt connection details without it. If you lose (or change) the key, you'll have to reset all of the connection details that have been encrypted with it in the Admin Panel.
2. Set your secret key as the environment variable `MB_ENCRYPTION_SECRET_KEY`.

### Example commands for creating and adding a key

1. You can use `openssl` to generate a cryptographically-secure, randomly-generated 32-character key. 
   ```
   openssl rand -base64 32
   ```
2. Copy the key to your clipboard. It should look something like this:
   ```
   IYqrSi5QDthvFWe4/WdAxhnra5DZC3RKx3ZSrOJDKsM=
   ```
3. Set the key as an environment variable and start Metabase as usual.
   ```
   MB_ENCRYPTION_SECRET_KEY="IYqrSi5QDthvFWe4/WdAxhnra5DZC3RKx3ZSrOJDKsM=" java -jar metabase.jar
   ```

Once you set the `MB_ENCRYPTION_SECRET_KEY` value, Metabase will securely encrypt and store the connection details for each new database that you add.

**Note**

> Some versions of Linux interpret single-quotes (`'`) and double-quotes (`"`) differently for environment variable values. If you upgrade to a newer version of Linux, and the key originally used single-quotes, you might need to wrap the key in double-quotes, so that the single-quotes are interpreted literally. For example, `MB_ENCRYPTION_SECRET_KEY='IYq...sM='` would become `MB_ENCRYPTION_SECRET_KEY="'IYq...sM='"`

## Encrypting an existing connection

If you added databases before setting the `MB_ENCRYPTION_SECRET_KEY` value, you can encrypt the connection details by going to each one of those databases in **Admin settings** > **Databases** and clicking on the **Save** button. Existing databases with unencrypted details will continue to work normally.

## Rotating an encryption key

1. We recommend that you [backup](../operations-guide/backing-up-metabase-application-data.md) your data before doing a key rotation.
2. Stop running your Metabase app.
3. Run the CLI command `rotate-encryption-key`.
   - Set the current encryption key as `MB_ENCRYPTION_SECRET_KEY`.
   - Set the new encryption key as a parameter.

### Example command for rotating a key

```
MB_ENCRYPTION_SECRET_KEY=your-current-key java -jar metabase.jar rotate-encryption-key new-key
```

## Disabling an encryption key

To disable an encryption key, follow the steps to [rotate an encryption key](#rotating-an-encryption-key), but use an empty string (`""`) as the new key.

### Example command for disabling a key

```
MB_ENCRYPTION_SECRET_KEY="your-current-key" java -jar metabase.jar rotate-encryption-key ""
```
