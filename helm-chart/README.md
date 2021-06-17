# Metabase Helm Chart

This page covers using the official Metabase Helm Chart for running Metabase. For docs on deploying Metabase with Kubernetes, check out [Running Metabase on Kubernetes](https://metabase.com/docs/latest/operations-guide/running-metabase-on-kubernetes.html).

To package this chart, run:

```bash
$ helm package metabase/
```

You'll now have a file with a `.tgz` extension that you can easily deploy with:

```bash
$ helm install filename.tgz
```

replacing the filename with the file you generated in the previous step.

## Official repository

Add the official repo like so:

```bash
$ helm repo add metabase https://www.metabase.com/helm
$ helm repo update
```
