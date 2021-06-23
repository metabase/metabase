# Running Metabase on Kubernetes

This guide will help you install Metabase on Kubernetes using [Metabase Helm chart](https://github.com/kubernetes/charts/tree/master/stable/metabase)

### Prerequisites

* Kubernetes 1.4+ with Beta APIs enabled

* [Helm](https://github.com/helm/helm) installed

### How to add the official Metabase Helm repo

```bash
$ helm repo add metabase https://www.metabase.com/helm
$ helm repo update
```

### How to run this chart
```bash
$ helm install metabase/metabase --generate-name
```
or, in the case you want to set a custom name (like "meta-helm-chart"):
```bash
$ helm install meta-helm-chart metabase/metabase
```

### Introduction

This chart bootstraps a [Metabase](https://github.com/metabase/metabase) deployment on a [Kubernetes](http://kubernetes.io) cluster using the [Helm](https://helm.sh) package manager. The chart sets up liveliness and readiness probes, and separates configuration details between ConfigMaps and Secrets.

This helm chart is highly configurable. For example, you can:
- Connect to any application database.
- Tune the Jetty server.
- Pass configuration parameters to Metabase to, for example, set the maximum number of data warehouse connections.

Note that the chart's default deployment will run Metabase with the H2 database, which is [strongly discouraged for production environments](https://www.metabase.com/docs/latest/operations-guide/migrating-from-h2.html).

This helm chart pulls the `latest` docker tag of the `metabase/metabase` image, but you can configure the chart to pull Metabase Enterprise, or a specific version.

### Uninstalling the Chart
To uninstall/delete the `meta-helm-chart` deployment:

```bash
$ helm delete meta-helm-chart
```

In the case you used `--generate-name` flag, you have to know which is the name that helm generated for the deployment by doing `helm list` and track down the chart with the name that starts with `metabase-` which will have a random number and then do:

```bash
$ helm delete metabase-@@@@@@@@@@
```

The command removes all the Kubernetes components associated with the chart and deletes the release.

### Configuration

The following table lists the configurable parameters of the Metabase chart and their default values.

| Parameter                        | Description                                                 | Default           |
| -------------------------------  | ----------------------------------------------------------- | ----------------- |
| replicaCount                     | desired number of controller pods                           | 1                 |
| podAnnotations                   | controller pods annotations                                 | {}                |
| podLabels                        | extra pods labels                                           | {}                |
| image.repository                 | controller container image repository                       | metabase/metabase |
| image.tag                        | controller container image tag                              | latest            |
| image.pullPolicy                 | controller container image pull policy                      | IfNotPresent      |
| fullnameOverride                 | String to fully override metabase.fullname template         | null              |
| config.jetty.host                | Listening on a specific network host                        | 0.0.0.0           |
| config.database.type             | Backend database type                                       | h2                |
| secrets.config.encryptionKey     | Secret key for encrypt sensitive information into database  | null              |
| secrets.database.connString      | Database connection URI (alternative to the below settings) | null              |
| secrets.database.host            | Database host                                               | null              |
| secrets.database.port            | Database port                                               | null              |
| secrets.database.dbname          | Database name                                               | null              |
| secrets.database.username        | Database username                                           | null              |
| secrets.database.password        | Database password                                           | null              |
| config.security.passComplexity   | Complexity requirement for Metabase account's password      | normal            |
| config.security.passLength       | Minimum length required for Metabase account's password     | 6                 |
| livenessProbe.initialDelaySeconds| Delay before liveness probe is initiated                    | 120               |
| livenessProbe.timeoutSeconds     | When the probe times out                                    | 30                |
| livenessProbe.failureThreshold   | Minimum consecutive failures for the probe                  | 6                 |
| readinessProbe.initialDelaySeconds | Delay before readiness probe is initiated                 | 30                |
| readinessProbe.timeoutSeconds    | When the probe times out                                    | 3                 |
| readinessProbe.periodSeconds     | How often to perform the probe                              | 5                 |
| service.type                     | ClusterIP, NodePort, or LoadBalancer                        | ClusterIP         |
| service.loadBalancerSourceRanges | Array of Source Ranges                                      | null              |
| service.externalPort             | Service external port                                       | 80                |
| service.internalPort             | Service internal port, should be the same as `listen.port`  | 3000              |
| service.nodePort                 | Service node port                                           | null              |
| service.annotations              | Service annotations                                         | {}                |
| ingress.enabled                  | Enable ingress controller resource                          | false             |
| ingress.hosts                    | Ingress resource hostnames                                  | null              |
| ingress.path                     | Ingress path                                                | /                 |
| ingress.labels                   | Ingress labels configuration                                | null              |
| ingress.annotations              | Ingress annotations configuration                           | {}                |
| ingress.tls                      | Ingress TLS configuration                                   | null              |
| resources                        | Server resource requests and limits                         | {}                |
| nodeSelector                     | Node labels for pod assignment                              | {}                |
| tolerations                      | Toleration labels for pod assignment                        | []                |
| affinity                         | Affinity settings for pod assignment                        | {}                |
| config.jetty.maxThreads          | Jetty max number of threads                                 | 50                |
| config.jetty.minThreads          | Jetty min number of threads                                 | 8                 |
| config.dw.maxConnectionPoolSize  | Maximum number of connections to a data warehouse           | 15                |

The above parameters map to the env variables defined in [metabase](http://github.com/metabase/metabase). For more information please refer to the [metabase documentations](http://www.metabase.com/docs/latest/).

Specify each parameter using the `--set key=value[,key=value]` argument to `helm install`. For example,

```bash
$ helm install meta-helm-chart \
  --set image.tag=v0.39.3,config.security.passComplexity=strong,config.security.passlength=10 \
    metabase/metabase
```

The above command starts Metabase on version `0.39.3`, `strong` user password complexity and minimum length at `10`

Alternatively, a YAML file that specifies the values for the parameters can be provided while installing the chart. For example,

```bash
$ helm install meta-helm-chart -f values.yaml metabase/metabase
```

Want to run [Metabase Enterprise](https://www.metabase.com/enterprise/)? simply do

```bash
$ helm install meta-helm-chart \
  --set image.tag=v1.39.3,image.repository=metabase/metabase-enterprise \
    metabase/metabase
```

> **Tip**: You can use the default [values.yaml](values.yaml)
