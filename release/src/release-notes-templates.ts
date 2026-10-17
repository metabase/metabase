
export const githubReleaseTemplate = `## Upgrading

> Before you upgrade, back up your Metabase application database!

Check out our [upgrading instructions](https://metabase.com/docs/latest/operations-guide/upgrading-metabase).

[Get the most out of Metabase](https://www.metabase.com/pricing?utm_source=github&utm_medium=release-notes&utm_campaign=plan-comparison). Learn more about advanced features, managed cloud, and first-class support.

## Metabase Open Source

Docker image: {{oss-docker-tag}}
JAR download: {{oss-download-url}}

## Metabase Enterprise

Docker image: {{ee-docker-tag}}
JAR download: {{ee-download-url}}

## Changelog

[Full Changelog]({{changelog-url}})

`;
