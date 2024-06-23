# Running Metabase on ECS

You can run Metabase in AWS ECS on both traditional ECS and Fargate (serverless containers).

## Steps
1) Create an Application Load Balancer and target group
2) Create ECS cluster
3) Create a Task definition (contaniner service)
4) Add a task to the cluster

### Create an Application Load Balancer and target group

Go to EC2 in the AWS Console and the left bar, search for Load Balancers and click the button **Create Load Balancer** and then click on **Create** in Application Load Balancer.

Fill the following information:
- Name: any name (could be ECS-LB)
- Scheme: internet-facing (this load balancer will be exposed to the internet)
- IP address type: ipv4 (unless you want to use ipv6)
- Listeners: leave it as is, unless you want to use HTTPS that you will have to add port 443
- Availability zones: select at least 2

Click next and if you chose to use only port 80, AWS will tell you that you are "not using any secure listener", which is fine if you are just testing. Click again in Next to go to **Security Groups**

On the Security Groups section, create a new Security group where you will have to provide a name and add only port 80 (if it's not added by default), listing to `0.0.0.0/0` and `::0/0`, this will mean that the load balancer will listen to any connection no matter where it comes from. You can tie this to your IP or your company IP address range if needed. Click on **Next: Configure Routing**

On the configure routing section:
- Target group: new target group
- Name: any name could be, we recommend `metabase-tg`
- Target type: IP
- Protocol: HTTP
- Port: 3000 (as we will hit Metabase container on the port it exposes)
- Protocol version: HTTP1
- Health checks:
  - Protocol: HTTP
  - Path: /api/health
  - Click on **Advanced health check settings** and override the port to 3000

Click **Next: register targets** and **Next: review** to get to the last section, where you will have the **Create** blue button to finally create your Load Balancer. When it finishes creating, locate the **DNS Name** of the Load balancer as it will be the URL you will need to point to when the cluster deploys the container.

### Create ECS cluster
Go to AWS ECS and click in Cluster -> Create Cluster under the Amazon ECS section
When choosing for a cluster template, choose between **Networking Only** (Fargate) and **EC2 Linux + Networking** (traditional). We will continue the guide with the **Fargate** model (this means that you don't provision any infrastructure, so this is why is called **Serverless containers**)

On Cluster name choose any name you wish for your cluster and enable the **Container insights** option if you need logs and telemetry data from the Metabase instance you will deploy (this is specially useful when you need to [scale horizontally](https://www.metabase.com/learn/data-diet/analytics/metabase-at-scale.html))

When the cluster ends the creation process, click on **View Cluster**

### Create a Task definition (container service)

You will first need to go to **Task definition** on the left side of the page before adding the task to the cluster. Once there click on **Create new Task Definition** and select **Fargate** as the launch type compatibility, then click Next.

- Task definition name, write any name you wish but we recommend using **Metabase-service**
- Task Role, select **ecsTaskExecutionRole**
- Task memory (GB): select at least 2GB
- Task CPU (vCPU): select at least 1vCPU

Click on **Add Container** under the **Container Definitions** section. Once there:

- Container name: Metabase
- Image: metabase/metabase:latest (we recommend pinning down the version, like v0.39.1, so it would be metabase/metabase:v0.39.1)
- Port mappings: 3000
- Environment variables: here you will be able to include any [environment variable](https://www.metabase.com/docs/latest/operations-guide/environment-variables.html)

Click on the **Add** button at the bottom to define the container for this task and then click **Create** on the task definition

### Add a service to the cluster

Go back to the cluster and click on the **Create** button under the **Services** tab.

- Launch type: Fargate 
- Task definition: select the one you just created in the step above.
- Service name: Metabase-service
- Number of tasks: 1 (you can increase the number here if needed, but remember that all need to be connected to the same application database and a load balancer will need to balance all these tasks)

Leave all other options as they are and click **Next Step**

On the **VPC and Security Groups** select the network you'll want the containers to be in, and in the subnets section select all the subnets you selected in the creation of the Load Balancer.

In the **Security groups** section, click on the **Edit** button and change the `Type` to `Custom TCP` and on `Port Range` insert 3000 (so the cluster will let the Load Balancer to get to the port 3000 on the container). Take note of the name of the Security Group as you will need it later.

On **Auto-assign public IP** leave it as ENABLED (we will restrict the access by a Security Group).

On **Load Balancing**, select **Application Load Balancer** and in the section above (Health check grace period) set the seconds to 60.

In **Container to Load Balance** section, click on **Add to Load Balancer** button with the `metabase:3000:3000` container on the dropdown list.

You will have a few options to select:
- Production listener port: select from the dropdown list `80:HTTP`
- Target group name: select the name of the target group you created

Click on **Next Step**, and on the **Set Auto Scaling** page click **Next step** once again.

When finished, click on **Create** and once it finishes creation, click on **View service**. 

Now go to the **Details** tab inside the Service you just created and look for the link that's next to **Security groups** and click on it. You will be taken to edit the security group that was just created.

Click on the security group and then click on **Edit inbound rules**, you will need to delete the source that says `0.0.0.0/0` and then look in the textbox and select the security group that was created for the Load Balancer.

Wait a few minutes and head to the URL of the DNS Name of the Load Balancer, you will have have Metabase running

## Troubleshooting:

### Metabase has less RAM than the Task definition

If you see that Metabase has less RAM than the one you assigned, you need to run the JAR file inside the container with the flag `-XX:MaxRAMPercentage=80`.

### Container hostnames

If you see in the container logs an error like `Couldn't generate instance Id!`, this means that the container can't generate a hostname for itself. You'll have to go to VPC in the AWS console, search for the VPC where you are deploying your containers and enable `DNS hostnames` (select the VPC, click on Actions, click on Edit DNS hostnames and tick the checkbox in the next screen).

### How to see the logs

Go to the ECS cluster, click on the service you created, click on the **Tasks** tab and click on the id of the Task. After opening the task, go to the Containers section, open the container that is running and click on **View logs in CloudWatch**

### How to upgrade Metabase version

Go to the task definition and create a new revision. On the container definition, use the new image. Save the new task definition and then go to the cluster, select the service and click on **Update**, you should be able to select the latest revision of the task definition which should have the new Metabase version.

**Note**: remember that you will need to connect the container with a persistent database in order to upgrade without losing changes.