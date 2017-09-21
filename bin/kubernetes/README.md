```bash
# Namespace
kubectl apply -f 00-namespace.yaml
# Service (has to be Type=NodePort)
kubectl apply -f service.yaml
kubectl apply -f deployment.yaml
kubectl apply -f ingress.yaml
```
