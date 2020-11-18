# NOTE: clean up 'Enhancements' and 'Bug fixes' sections and remove this line before publishing!

**Enhancements**

{{#enhancements}}
*  {{title}} (#{{number}})
{{/enhancements}}

**Bug fixes**

{{#bug-fixes}}
*  {{title}} (#{{number}})
{{/bug-fixes}}

**Upgrading**

You can download a .jar of the release, or get the latest on Docker. Make sure to back up your Metabase
database before you upgrade! Need help? Check out our
[upgrading instructions](https://metabase.com/docs/latest/operations-guide/upgrading-metabase.html).

Docker image: `{{docker-tag}}`
Download the JAR here: {{download-url}}

**Notes**

SHA-256 checksum for the {{version}} JAR:

```
{{checksum}}
```
