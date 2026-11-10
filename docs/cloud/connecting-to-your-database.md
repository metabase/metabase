---
title: "Connecting Metabase Cloud to your database"
description: "How Metabase Cloud connects to your database: the IP addresses to allow, an SSH tunnel to a database in a private network or VPC, and other options for a private database."
version: latest
has_magic_breadcrumbs: true
show_category_breadcrumb: true
show_title_breadcrumb: true
category: "Cloud"
layout: new-docs
---

# Connecting Metabase Cloud to your database

Metabase Cloud connects to your database from three fixed IP addresses in your Metabase's region. If your database has a public endpoint, allow those addresses on the database port in your firewall or security group. If your database is in a private network, such as a private subnet in an AWS VPC, connect through an SSH tunnel to a bastion host in that network. SSH tunnels are available on every Metabase Cloud plan.

## Metabase Cloud IP addresses to whitelist on your database

Allow the three addresses for your Metabase's region. These are the same addresses listed on [IP addresses to whitelist](./ip-addresses-to-whitelist.md).

- United States (North Virginia), `us-east-1`: `18.207.81.126`, `3.211.20.157`, and `50.17.234.169`
- Europe (Frankfurt), `eu-central-1`: `18.192.2.142`, `18.184.191.58`, and `3.65.184.173`
- Asia Pacific (Singapore), `ap-southeast-1`: `54.179.42.215`, `3.1.176.8`, and `18.139.48.211`
- Asia Pacific (Sydney), `ap-southeast-2`: `13.238.131.1`, `3.105.237.132`, and `54.252.39.14`
- South America (São Paulo), `sa-east-1`: `18.228.120.123`, `54.207.106.108`, and `18.228.120.162`

## Connect to a private database through an SSH tunnel

A bastion host is a small server at the edge of your private network that accepts SSH connections. Metabase opens an SSH connection to the bastion, then connects from the bastion to your database. Metabase has a built-in SSH client, so you set up the whole tunnel in the database connection form.

1. Run a bastion host in a public subnet of your private network. In its SSH server configuration, set `AllowTcpForwarding yes` and configure SSH to listen on a non-standard, unused port instead of port 22.
2. Allow inbound traffic to the bastion on that SSH port only from the Metabase Cloud IP addresses for your region.
3. Allow inbound connections to your database from the bastion host on the database's listening port (through network rules, firewall, or database configuration).
4. In Metabase, click the **grid** icon in the top right, and go to **Admin** > **Databases** > **Add a database**. Choose your database, and turn on **Use an SSH tunnel**.
5. In **Host** and **Port**, enter your database's hostname and port as seen from inside the network. In **SSH tunnel host** and **SSH tunnel port**, enter the bastion's public address and the SSH port you configured in step 1.

Keep the bastion host updated with security patches.

For the authentication options and for troubleshooting, see [SSH tunneling](../databases/ssh-tunnel.md).

To run Metabase inside the same network as your database instead, see [Dashboards on a private database: SSH tunnel or VPC](https://www.metabase.com/articles/dashboards-on-a-private-database).

## Use a read-only database user

Whichever way you connect, use a database user that can only read the data you want to analyze. See [Database users, roles, and privileges](../databases/users-roles-privileges.md).

## Further reading

- [IP addresses to whitelist](./ip-addresses-to-whitelist.md)
- [SSH tunneling](../databases/ssh-tunnel.md)
- [Database users, roles, and privileges](../databases/users-roles-privileges.md)
- [Dashboards on a private database: SSH tunnel or VPC](https://www.metabase.com/articles/dashboards-on-a-private-database)
