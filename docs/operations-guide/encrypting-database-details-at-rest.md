# Encrypting your database connection details at rest

Metabase stores connection information for the various databases you add in the Metabase application database. To prevent bad actors from being able to access these details if they were to gain access to
the application DB, Metabase can automatically encrypt them when they are saved, and decrypt them on-the-fly whenever they are needed. The only thing you need to do is set the environment variable
`MB_ENCRYPTION_SECRET_KEY`.

Your secret key must be at least 16 characters (longer is even better!), and we recommend using a secure random key generator to generate it. `openssl` is a good choice:

    openssl rand -base64 32

This gives you a cryptographically-secure, randomly-generated 32-character key that will look something like `IYqrSi5QDthvFWe4/WdAxhnra5DZC3RKx3ZSrOJDKsM=`. Set it as an environment variable and
start Metabase as usual:

    MB_ENCRYPTION_SECRET_KEY="IYqrSi5QDthvFWe4/WdAxhnra5DZC3RKx3ZSrOJDKsM=" java -jar metabase.jar

**Note** Some versions of Linux interpret single-quotes (`'`) and double-quotes (`"`) differently for environment variable values, so if you upgrade to a newer version of Linux, and the key originally used single-quotes, you might need to wrap the key in double-quotes, so that the single-quotes are interpreted literally. For example, `MB_ENCRYPTION_SECRET_KEY='IYq...sM='` would be `MB_ENCRYPTION_SECRET_KEY="'IYq...sM='"`

Metabase will securely encrypt and store the connection details for any new Databases you add. (Connection details for existing databases will be encrypted as well if you save them in the admin panel).
Existing databases with unencrypted details will continue to work normally.

>Take care not to lose this key because you can't decrypt connection details without it. If you lose (or change) the key, you'll have to reset all of the connection details that have been encrypted with it in the Admin Panel.
