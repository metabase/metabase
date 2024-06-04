---
title: SSH tunneling
redirect_from:
  - /docs/latest/administration-guide/ssh-tunnel-for-database-connections
---

# SSH tunneling

Metabase can connect to some databases by first establishing a connection to a server in between Metabase and a data warehouse, then connecting to the data warehouse using that connection as a bridge. This makes connecting to some data warehouses possible in situations that would otherwise prevent the use of Metabase.

## When to use SSH tunneling

In general, there are two basic use cases for an SSH tunnel:

- When a direct connection is impossible.
- When a direct connection is forbidden due to a security policy.

Sometimes when a data warehouse is inside an enterprise environment, direct connections are blocked by security devices such as firewalls and intrusion prevention systems. Bastion hosts offer the option to first connect to a computer on the edge of the protected network, then, from that bastion host computer, establish a second connection to the data warehouse within the internal network, essentially patching these two connections together. Using the SSH tunneling feature, Metabase can automate this process.

> [Metabase Cloud](https://www.metabase.com/cloud/) does not currently support VPN connections to databases. To connect to databases in private networks, you can instead use SSH tunneling.

## How to use SSH tunneling

When connecting though a bastion host:

- Answer yes to the "Use an SSH-tunnel for database connections" parameter.
- Enter the hostname for the data warehouse as it is seen from inside the network in the `Host` parameter.
- Enter the data warehouse port as seen from inside the network into the `Port` parameter.
- Enter the external name of the bastion host as seen from the outside of the network (or wherever you are) into the `SSH tunnel host` parameter.
- Enter the SSH port as seen from outside the network into the `SSH tunnel port` parameter. This is usually 22, regardless of which data warehouse you are connecting to.

For authentication, you have two options:

- **Using a username and password:**

  - In the `SSH tunnel username` and `SSH tunnel password` fields, enter the username and password you use to log in to the bastion host.

- **Using SSH key (PKI authentication):**

  - Select SSH Key for the `SSH authentication` option.
  - Paste the contents of your SSH private key into the `SSH private key` field.
  - If your key has a passphrase, enter it into the `Passphrase for the SSH private key` field.

If you're unable to connect test your SSH credentials by connecting to the SSH server/Bastion Host using ssh directly:

```
ssh <SSH tunnel username>@<SSH tunnel host> -p <SSH tunnel port>
```

Another common case where direct connections are impossible is when connecting to a data warehouse that is only accessible locally and does not allow remote connections. In this case you will be opening an SSH connection to the data warehouse, then from there connecting back to the same computer.

- Answer yes to the "Use an SSH-tunnel for database connections" parameter.
- Enter `localhost` in the `Host` parameter. This is the name the server.
- Enter the same value in the `Port` parameter that you would use if you where sitting directly at the data warehouse host system.
- Enter the external name of the data warehouse, as seen from the outside of the network (or wherever you are) into the `SSH tunnel host` parameter.
- Enter the SSH port as seen from outside the network into the `SSH tunnel port` parameter. This is usually 22, regardless of which data warehouse you are connecting to.
- Choose your authentication method as described above (username and password or SSH key).

If you have problems connecting, verify the SSH host port and password by connecting manually using ssh or PuTTY on older windows systems.

## Disadvantages of indirect connections

While using an SSH tunnel makes it possible to use a data warehouse that is otherwise inaccessible, it's almost always preferable to use a direct connection when possible.

There are several inherent limitations to connecting through a tunnel:

- If the enclosing SSH connection is closed because you put your computer to sleep or change networks, all established connections will be closed as well. This can cause delays resuming connections after suspending your laptop.
- It's almost always slower. The connection has to go through an additional computer.
- Opening new SSH connections takes longer.
- Multiple operations over the same SSH tunnel can block each other. This can increase latency.
- The number of connections through a bastion host is often limited by organizational policy.
- Some organizations have IT security policies forbidding using SSH tunnels to bypass security perimeters.

## Running SSH directly

The SSH tunneling feature in Metabase exists as a convenient wrapper around SSH, and automates the common cases of connecting through a tunnel. It also makes connections possible with systems that don't give shell access. Metabase uses a built-in SSH client that doesn't depend on the installed system's SSH client. This allows connections from systems where you can't run SSH manually. It also means that Metabase can't take advantage of authentication services provided by the system, such as Windows Domain Authentication or Kerberos Authentication.

If you need to connect using a method not enabled by Metabase, you can often accomplish this by running SSH directly:

```
ssh -Nf -L input-port:internal-server-name:port-on-server username@bastion-host.domain.com
```

This allows you to use the full array of features included in SSH. If you find yourself doing this often, please let us know so we can see about making your process more convenient through Metabase.

## Further reading

- [Adding and managing databases](./connecting.md).
