# Metabase Helm Chart

This is the official source of Metabase Helm Chart. If you are looking about the documentation to deploy this into your K8S cluster, check out our documentation in [Metabase Operations Guide](https://metabase.com/docs/latest/operations-guide/running-metabase-on-kubernetes.html)

If you want to package this chart, just do:

```bash
$ helm package metabase/
```

You'll now have a file with a `.tgz` extension that you can easily deploy with:

```bash
$ helm install filename.tgz
```

replacing the filename with the file you generated in previous step

## Official repository

Looking for the official repository? Add the repo metabase.com/helm by doing

```bash
$ helm repo add metabase https://www.metabase.com/helm
$ helm repo update
```
