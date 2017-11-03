# Running Metabase on Kubernetes

This guide will help you install Metabase on Kubernetes using [Metabase Helm chart](https://github.com/kubernetes/charts/tree/master/stable/metabase)

### Prerequisites

* Kubernetes 1.4+ with Beta APIs enabled

* [Kubernetes Helm](https://github.com/kubernetes/helm) installed


### Installing

To install with the release name `my-release`:

```bash
$ helm install --name my-release stable/metabase
```

### Configuring

By default, backend database (H2) is stored inside container, and will be lost after container restart.

So we **highly recommended** to use MySQL or Postgres instead.

Copy these [**default configuration**](https://github.com/kubernetes/charts/blob/master/stable/metabase/values.yaml) into a new file named `metabase-config.yaml`, then modify as your need.

Deploy Metabase using your config file:

```bash
$ helm install --name my-release -f metabase-config.yaml stable/metabase
```

