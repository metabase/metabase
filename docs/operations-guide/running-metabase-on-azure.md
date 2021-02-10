# Running Metabase on Microsoft Azure

This guide will cover the basics for running your Metabase instance in Microsoft Azure thanks to the power and flexibility of Docker Containers. At the end of this guide you will have set up a Metabase instance with its own database, ready to be scaled in case you need more power.

- [Running Metabase on Microsoft Azure](#running-metabase-on-microsoft-azure)
  - [Step 1: Create the resource group (resource grouping)](#step-1-create-the-resource-group-resource-grouping)
  - [Step 2: Create the VNET (virtual network)](#step-2-create-the-vnet-virtual-network)
  - [Step 3: Create the Application Database (PostgreSQL)](#step-3-create-the-application-database-postgresql)
  - [Step 4: Create the private endpoint connection](#step-4-create-the-private-endpoint-connection)
  - [Step 5: Create web application (deploy Metabase)](#step-5-create-web-application-deploy-metabase)
  - [Additional configurations](#additional-configurations)
    - [How to enable Health checks](#how-to-enable-health-checks)
    - [How to update](#how-to-update)
    - [How to see the logs](#how-to-see-the-logs)
    - [Performance tuning](#performance-tuning)
    - [Custom domains](#custom-domains)
    - [Scale-up vs Scale-out](#scale-up-vs-scale-out)
    - [CORS](#cors)
    - [Database name](#database-name)


## Step 1: Create the resource group (resource grouping)

On the Azure management console, click on the **Resource Groups** icon at the top of the page (or just search for Resource Groups). If you already have a resource group, you can go straight to [Step 2](#step-2-create-the-network).

On the resource group page, click on the **+ Add** button in the top bar to create a new resource group. On the **Create a resource group** page, select your valid Azure Subscription, enter the name of your resource group, and select a region.

![Create a Resource Group](images/AZResource_group_Add.png)

Click **Next**  until you see the **Create** button, then click it.

When selecting the region for your Metabase, you should consider the location of your users and your data warehouse, as well as the infrastructure costs and privacy laws that might restrict cross-border data transfers.

## Step 2: Create the VNET (virtual network)

At the center of the page, click on the **Create resources** button. Search for **VNET**:

![VNET Marketplace](images/AZMarketPlaceVnet.png)

Select the VNET product from Microsoft, and click **Create**:

![VNET Product](images/AZVnet.png)

Enter a name for the virtual network and select the same region you used for the resource group. Click on **Next: IP Addresses** button at the bottom.

Here we'll create a secure network composed of a public subnet (a network that is exposed to the internet), and a private network that will contain your application database.

In the IPv4 address, you should have a default value of 10.0.0.0/16 (otherwise add that network space to the box). Next, add two subnets:

- one subnet named public, with the subnet address range of 10.0.1.0/24, and
- one subnet named private with the subnet range of 10.0.2.0/24.

![Azure network configuration](images/AZNetworks.png)

Click **Next** until you get to the **Review and create** page, then click on the **Create** button at the bottom to create your network.

## Step 3: Create the Application Database (PostgreSQL)

From the Azure Management console homepage, create a new resource. This time search for **Azure Database for PostgreSQL**. You can also find this database in the Marketplace menu under **Databases**.

![Azure PostgreSQL](images/AZDatabase.png)

In the next page you will have to select the way you will use the service. Choose **Single server** for now, which is a good starting point, but take into account that this will create just one instance of PostgreSQL that will be your single point of failure.

On the next screen, select or enter the following:

- Resource group: the one you are including all your components
- Server name: a unique name for your database
- Data Source: can be left as `None`
- Location: the same one you used for your Resource Group and VNET
- Version: use the latest one you can
- Compute + Storage: you can re-dimension your database,  but you must select the `General Purpose` tier, as it's the only tier that provides a Private Link.
- choose an admin username and password of your choice

Click **Next** until you get to the final page, then click **Create**. It'll take some time for Azure to create the database. Once the creation is complete, click on the **Go to resource** button.

## Step 4: Create the private endpoint connection

On the properties page for the Azure for PostgreSQL database, you can manage parameters for your database. You'll create the **Private Endpoint** to the database, so all traffic from the web application is routed internally through Azure's network.

On the left bar, click on **Private endpoint connection** which is situated under **Security**

![Azure Database for PostgreSQL](images/AZPostgreSQLMain.png)

Now click on the button of the top with a plus sign that says **Private endpoint** and a new page opens:
1) Provide a name for this link (any name that describes what you are trying to do is ok, like `metabase_link`). Select the region where the database lives, click Next.
2) On the **Resource** section of the configuration, ensure that **Resource type** is set to `Microsoft.DBforPostgreSQL/servers` which will enable you to select in the dropdown below the server created in the previous step, and leave **Target sub-resource** with the default value
3) On the **Configuration** section, the only value that needs to be changed is the **Subnet** one, where you need to select the **private** subnet that you created on the first step of this guide, and leave everything else as it is.

![Azure PrivateLink config](images/AZPrivateLink.png)

Now go to the last step and click **Create**. Once the link finishes its creation, you will need two more things to go to the next step:
1) Go to the database Connection Security item and deny all public network access
2) go to the VNET component and in the **Connected devices** settings option, you will now see that a device connected to the network with an IP Address (take note of that IP Address as it will be needed in the next step)

## Step 5: Create web application (deploy Metabase)

At last, the step where all the magic comes together: go to your resource group and add a new resource, or search for **Web App** in the Marketplace (blue globe icon).
![Azure web app](images/AZMarketplaceWebApp.png)

Now set up the following values on the page (resource group should be the same as in the first step):
- Name: choose any name, but is has to be unique as the subdomain is shared across all Azure deployments
- Publish: Docker Container
- Operating System: Linux
- Region: same as the one on the previous steps
- App Service Plan: if you don't have one already, it will create a new one automatically
- SKU and Size: change it to a Production level plan with **AT LEAST** 200 total ACU and 3.5GB of memory, click **Apply** after choosing the specs

Now go to the next step where you will select:
- Options: single container
- Image source: DockerHub
- Access Type: Public
- Image and tag: metabase/metabase:latest (or choose any other docker image tag of your preference, like our Enterprise Edition that has super-powers). If you want to see which is the latest Metabase version you can check in our [Community Edition Dockerhub repository](https://hub.docker.com/r/metabase/metabase/tags?page=1&ordering=last_updated) and also our [Enterprise Edition Dockerhub Repository](https://hub.docker.com/r/metabase/metabase-enterprise/tags?page=1&ordering=last_updated)
- Startup command: empty

Click next till you get to the last section and click on **Create** to initialize the creation of your application and wait till it's over.

Now go to te application configuration page and click on Settings --> Networking on the left side of the page, where a page will appear and you will have to click on **Click here to configure** under **VNET integration**.

![Azure VNET integration](images/AZVNETintegration.png)

Now click on the huge plus sign next to **Add VNET** and select the VNET that you created on the first step and the public subnet to set the server on the public subnet of the VNET, and click OK.

![Azure VNET public subnet](images/AZVNETPublicSubnet.png)

Now go back to te application configuration page and click on Settings --> Configuration on the left side of the page where you will see a few Application Settings already configure.

Here you will need to add the [Enviroment Variables]() for connecting Metabase to its [PostgreSQL Application Database](), but make sure that you use the **MB_DB_CONNECTION_URI** as PostgreSQL in Azure is configured by default with SSL so currently the only way of passing those parameters is by using the full URI.

Also, take into account that the username in Azure PostgreSQL is `user@name_of_your_database_engine` so in this case the entire connection uri would be as follows: `postgresql://databasePrivateIPAddress:port/postgres?user=user@name_of_your_database_engine&password=configuredpassword&ssl=true&sslmode=required`.

Lets put an example, if you got this information from the previous steps:
1) database private IP address: 10.0.2.4
2) database port: 5432 (in the case of Postgres, MySQL/MariaDB default port is 3306)
3) name of the database server: metabase-app-database
4) username of the database: metabase
5) password: Password1!

then my connection string will be: `postgresql://10.0.2.4:5432/postgres?user=metabase@metabase-app-database&password=Password1!&ssl=true&sslmode=require`

Click on save and the instance will restart. After this step you will be able to access your Metabase in the URL that you have in the "Overview" tab in the web app under the URL section (will be the name you chose in the first step of the config of the web app + .azurewebsites.net as Azure handles all the deployment and domain)

## Additional configurations
### How to enable Health checks

Enabling health checking in Metabase is a good practice. You can tell the "host" when Metabase is ready to server your customers by just doing a simple configuration: go to your web app -> Monitoring -> Health Check -> Enable health check and include in the path `/api/health`.

### How to update

Simply go to your web app and in Settings -> Container Settings (Classic) and there change the image version of Metabase.
In the same way you do an upgrade, you can change the Metabase version to Enterprise by switching to v1 instead of v0 in the prefix of the docker image.

**Important**: always ensure you have a backup of your Database before doing a version upgrade, *specially*, when upgrading between major versions.

### How to see the logs

If you want to see the logs of your deployment, you need to go to the web app that you created and you will be able to see the streaming logs in Monitoring -> Log stream.

### Performance tuning

- Disable FTP State
- Change HTTP version to 2.0
- Enable WebSockets
- ARR Affinity enabled in case you scale out

### Custom domains

You can go to Settings -> custom domains in your web app use a custom domain that you have in Azure, with your own certificates

### Scale-up vs Scale-out

Azure provides an easy way in which you can increase the server's horsepower by doing a Scale-up. Simply choose a pricing tier with more RAM and CPU count and restart the instance. This approach is easier than scaling out and you should choose this option first before scaling out.

In case you know what you are doing and want to have a highly-available Metabase deployment, you can tell your web app to scale-out (more servers serving the application in parallel). Simply go to Scale-out and use the slider to ask for more instances or use a custom autoscaling policy (like more servers during your work hours and less during night, or anything you come up with)

### CORS

In case you are using embedding, you might have to enable CORS in Settings -> CORS in the web application. You will need to fill the origin domains from where you are embedding so Azure knows that they need to enable cross requests from there.

### Database name

Azure does not let users create a database upon service creation, that's the reason why we used `postgres` as the database to install Metabase. Althought this shouldn't be a problem, a good practice would be to install the database in a separate database named `metabase`. If you are not in a hurry to try the product, you should create a database named `metabase` as soon as you create the database and then use the appropiate connection string when deploying the docker container.
In the example above the connection string would be `postgresql://10.0.2.4:5432/metabase?user=metabase@metabase-app-database&password=Password1!&ssl=true&sslmode=require`