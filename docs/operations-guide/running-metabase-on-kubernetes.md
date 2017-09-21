# Running Metabase on [Kubernetes](https://kubernetes.io/)

## Prerequisite

Make sure you are connected to your kubernetes.

For Google Cloud, the commands are:

``` bash
gcloud container clusters get-credentials <cluster-name> --zone <zone> --project <project-id>
```

## Configure (optional)

Update `bin/kubernetes/web-deployment.yaml` file with your configurations, especially database.

A method to secure your deployment secrets is to use secrets service by kubernetes. [Read more.](https://kubernetes.io/docs/user-guide/secrets/)

## Setup

- Create a kubernetes service

``` bash
kubectl create -f bin/kubernetes/web-service.yaml
```

- Create a deployment

``` bash
kubectl create -f bin/kubernetes/web-deployment.yaml --record
```

- Get service

``` bash
kubectl get svc
```

Use the external-ip displayed here to configure your metabase


## Check Deployment (optional)

- Check Deployment

``` bash
kubectl get deployments
```

- Check Replica Set

``` bash
kubectl get rs
```

- Check pods

``` bash
kubectl get pods --show-labels
```

- Check rollout status

``` bash
kubectl rollout status deployment/metabase
```

- Describe deployments

``` bash
kubectl describe deployments
```

## Upgrading Metabase

- Update deployment

``` bash
kubectl set image deployment/metabase metabase=metabase/metabase:latest
```

- Check rollout status

``` bash
kubectl rollout status deployment/metabase
```

- Check rollout history

``` bash
kubectl rollout history deployment/metabase
```

## Rollback

- Rollback to previous version

``` bash
kubectl rollout undo deployment/metabase --to-revision=2
```

## Scaling
NOTE: Currently Metabase is not horizontly scalable. See https://github.com/metabase/metabase/issues/1446 and https://github.com/metabase/metabase/issues/2754

- Auto scale

``` bash
kubectl autoscale deployment metabase --min=5 --max=15 --cpu-percent=80
```

### Additional custom settings

While running Metabase on docker you can use any of the custom settings from [Customizing the Metabase Jetty Webserver](./start.md#customizing-the-metabase-jetty-webserver) by setting environment variables on your docker run command.

Now that you’ve installed Metabase, it’s time to [set it up and connect it to your database](../setting-up-metabase.md).
