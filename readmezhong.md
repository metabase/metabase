# Metabase
Metabase是公司中每个人可以提出问题并从数据中学习的一种简单、开源的方式。

![Metabase 产品截图](docs/metabase-product-screenshot.png)

[![最近版本发布](https://img.shields.io/github/release/metabase/metabase.svg?label=latest%20release)](https://github.com/metabase/metabase/releases)
[![Github认证](https://img.shields.io/badge/license-AGPL-05B8CC.svg)](https://raw.githubusercontent.com/metabase/metabase/master/LICENSE.txt)
[![Circle CI](https://circleci.com/gh/metabase/metabase.svg?style=svg&circle-token=3ccf0aa841028af027f2ac9e8df17ce603e90ef9)](https://circleci.com/gh/metabase/metabase)
[![Gitter 聊天](https://badges.gitter.im/metabase/metabase.png)](https://gitter.im/metabase/metabase)

# Features
- 5 分钟 [创建](https://metabase.com/docs/latest/setting-up-metabase.html) (不是开玩笑的呦~)
- 可以让公司里的任何人 [问问题](https://metabase.com/docs/latest/users-guide/04-asking-questions.html) 并且可以不懂任何SQL技术知识。
- 非常好看的 [控制面板](https://metabase.com/docs/latest/users-guide/06-sharing-answers.html) 并且具有自动刷新和全屏显示的功能
- SQL模式已被数据分析专业人士建好
- 创建规范的 [分类和指标](https://metabase.com/docs/latest/administration-guide/07-segments-and-metrics.html) 为公司的所有人使用所提供便利
- 有发送数据到Slack或电子邮件的时间表 [Pulses](https://metabase.com/docs/latest/users-guide/10-pulses.html)
- 在Slack里使用 [MetaBot](https://metabase.com/docs/latest/users-guide/11-metabot.html)可随意浏览。
- [人性化的数据](https://metabase.com/docs/latest/administration-guide/03-metadata-editing.html) 为您的团队重命名、注释和隐藏字段

想知道更多信息，请访问 [metabase.com](https://metabase.com/)

## 所支持的数据库：

- Postgres
- MySQL
- Druid
- SQL Server
- Redshift
- MongoDB
- Google BigQuery
- SQLite
- H2
- Oracle
- Vertica
- Presto
- Snowflake
- SparkSQL

没有看到您最喜欢的数据库?提交issue来通知我们。

## 安装

Metabase几乎可以运行于任何地方，所以请浏览我们的 [安装指南](https://metabase.com/docs/latest/operations-guide/start.html#installing-and-running-metabase) 参阅各种部署的详细说明。  这里有 TLDR:

### Docker

想通过 Docker来打开Metabase, 只需要输入

```sh
docker run -d -p 3000:3000 --name metabase metabase/metabase
```

### JVM Jar

要运行jar，需要安装Java运行时。作为一个快速检查，看看您的系统是否已经有一个， 请尝试：

```sh
java -version
```

If you see something like

```sh
java version "1.8.0_51"
Java(TM) SE Runtime Environment (build 1.8.0_51-b16)
Java HotSpot(TM) 64-Bit Server VM (build 25.51-b03, mixed mode)
```

您可以开始运行了。否则，请下载Java运行时环境： http://java.com/

打开 [Metabase 下载页面](https://metabase.com/start/) 下载当前版本。将下载的jar放到一个新创建的目录中(因为它在运行时会创建一些文件)，并在命令行上运行:

```sh
java -jar metabase.jar
```

现在，打开一个浏览器并且输入 [http://localhost:3000](http://localhost:3000) , 您会被问到一组问题来建立一个用户帐户，然后您可以添加一个数据库连接。如要实现这一功能，您需要获得有关希望连接到哪个数据库的一些信息，比如它所运行的主机名和端口、数据库名以及将要使用的用户和密码。

一旦您添加了这个连接，您将被带到应用程序，您将准备好问你的第一个问题。.

有关更详细的演练，请查看我们的 [从这里开始](docs/getting-started.md) 指南.

# Q&A

如果有一些问题经常出现。首先检查在这里:
[FAQ](docs/faq.md)

# 安全信息披露

安全对我们来说非常重要。如果您发现任何有关安全的问题，请通过发送电子邮件到security@metabase.com，这个邮件将会负责安全问题。请不要只在Github上发布一个issue来通知我们。


# 贡献

要开始使用Metabase的开发安装，请遵循我们的说明 [开发者指南](docs/developers-guide.md).

然后请浏览我们的 [贡献指南](docs/contributing.md) 了解有关我们的工作过程和你可以在哪里找到更适合的信息!

与其他贡献人员一起聊天 [Gitter群聊房间](https://gitter.im/metabase/metabase).

# 国际化
我们希望Metabase在尽可能多的语言中可用。来看看哪些翻译是可用的，并帮助其他国家的用户来使用我们的项目 [over at POEditor](https://poeditor.com/join/project/ynjQmwSsGh)

# 扩展和深度集成

Metabase还允许你直接从Javascript点击我们的查询API，集成我们提供的简单分析与你自己的应用程序或第三方服务做这样的事情:

* 建立适度的接口
* 将用户的子集导出到第三方营销自动化软件
* 为公司中的人员提供专门的客户查询应用程序


# 危险区域

以下的按键将会改变README.md文件在Heroku上运行。Metabase 的开发者也会使用它来检测我们的PRs，等等。 我们不建议您用这个按键。相反，请使用一个 [稳定平台](https://metabase.com/start).

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

# 许可证

除非另有说明，所有Metabase源文件都是根据GNU Affero通用公共许可证的条款提供的 (AGPL).

浏览 [LICENSE.txt](https://github.com/metabase/metabase/blob/master/LICENSE.txt) for details and exceptions.

除非另有说明，所有文件 © 2019 Metabase, Inc.
