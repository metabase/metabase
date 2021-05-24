## SSH tunneling in Metabase

Metabase has the ability to connect to some databases by first establishing a connection to a server in between Metabase and a data warehouse, then connecting to the data warehouse using that connection as a bridge. This makes connecting to some data warehouses possible in situations that would otherwise prevent the use of Metabase.

- [When to use SSH tunneling](#when-to-use-ssh-tunneling)
- [How to use SSH tunneling](#how-to-use-ssh-tunneling)
- [Disadvantages of indirect connections](#disadvantages-of-indirect-connections)
- [Running SSH directly](#running-ssh-directly)

### When to use SSH tunneling

In general, prefer a Virtual Private Network (VPN) to SSH tunneling, but there are two basic use cases for an SSH tunnel:

- When a direct connection is impossible.
- When a direct connection is forbidden due to a security policy.

Sometimes when a data warehouse is inside an enterprise environment, direct connections are blocked by security devices such as firewalls and intrusion prevention systems. To grant access to this environment, many enterprises offer a VPN, a bastion host, or both. VPNs are the more convenient and reliable option, though bastion hosts are used frequently, especially with cloud providers such as Amazon Web Services where VPC (Virtual Private Clouds) prohibit direct connections. Bastion hosts offer the option to first connect to a computer on the edge of the protected network, then from that bastion host computer establish a second connection to the data warehouse on the internal network, essentially patching these two connections together. Using the SSH tunneling feature, Metabase can automate this process. 

### How to use SSH tunneling

When connecting though a bastion host:

- Answer yes to the "Use an SSH-tunnel for database connections" parameter.
- Enter the hostname for the data warehouse as it is seen from inside the network in the `Host` parameter.
- Enter the data warehouse port as seen from inside the network into the `Port` parameter.
- Enter the external name of the bastion host as seen from the outside of the network (or wherever you are) into the `SSH tunnel host` parameter.
- Enter the SSH port as seen from outside the network into the `SSH tunnel port` parameter. This is usually 22, regardless of which data warehouse you are connecting to.
- Enter the username and password you use to login to the bastion host into the `SSH tunnel username` and `SSH tunnel password` parameters.

If you're unable to connect test your SSH credentials by connecting to the SSH server/Bastion Host using ssh directly:

```
ssh <SSH tunnel username>@<SSH tunnel host> -p <SSH tunnel port>
```

Another common case where direct connections are not possible is when connecting to a data warehouse that is only accessible locally and does not allow remote connections. In this case you will be opening an SSH connection to the data warehouse, then from there connecting back to the same computer.

- Answer yes to the "Use an SSH-tunnel for database connections" parameter.
- Enter `localhost` in the `Host` parameter. This is the name the server.
- Enter the same value in the `Port` parameter that you would use if you where sitting directly at the data warehouse host system.
- Enter the extenal name of the data warehouse, as seen from the outside of the network (or wherever you are) into the `SSH tunnel host` parameter.
- Enter the SSH port as seen from outside the network into the `SSH tunnel port` parameter. This is usually 22, regardless of which data warehouse you are connecting to.
- Enter the username and password you use to login to the bastion host into the `SSH tunnel username` and `SSH tunnel password` parameters.

If you have problems connecting, verify the SSH host port and password by connecting manually using ssh or PuTTY on older windows systems.

### Disadvantages of indirect connections

While using an SSH tunnel makes it possible to use a data warehouse that is otherwise inaccessible, it's almost always preferable to use a direct connection when possible.

There are several inherent limitations to connecting through a tunnel:

- If the enclosing SSH connection is closed because you put your computer to sleep or change networks, all established connections will be closed as well. This can cause delays resuming connections after suspending your laptop.
- It's almost always slower. The connection has to go through an additional computer.
- Opening new SSH connections takes longer.
- Multiple operations over the same SSH tunnel can block each other. This can increase latency.
- The number of connections through a bastion host is often limited by organizational policy.
- Some organizations have IT security policies forbidding using SSH tunnels to bypass security perimeters.

### Running SSH directly 

The SSH tunneling feature in Metabase exists as a convenient wrapper around SSH, and automates the common cases of connecting through a tunnel. It also makes connections possible with systems that don't give shell access. Metabase uses a built-in SSH client that doesn't depend on the installed system's SSH client. This allows connections from systems where you can't run SSH manually. It also means that Metabase can't take advantage of authentication services provided by the system, such as Windows Domain Authentication or Kerberos Authentication.

If you need to connect using a method not enabled by Metabase, you can often accomplish this by running SSH directly:

```
ssh -Nf -L input-port:internal-server-name:port-on-server username@bastion-host.domain.com
```

This allows you to use the full array of features included in SSH. If you find yourself doing this often, please let us know so we can see about making your process more convenient through Metabase.

### Further reading

For more on connecting a database to Metabase, see [Adding and managing databases](01-managing-databases.md).
