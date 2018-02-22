<?xml version="1.0" encoding="UTF-8"?>
<!--
  ~ © 2017 Stratio Big Data Inc., Sucursal en España. All rights reserved
  ~
  ~ This software is a modification of the original software mesosphere/dcos-kafka-service licensed under the
  ~ Apache 2.0 license, a copy of which is included in root folder. This software contains proprietary information of
  ~ Stratio Big Data Inc., Sucursal en España and may not be revealed, sold, transferred, modified, distributed or
  ~ otherwise made available, licensed or sublicensed to third parties; nor reverse engineered, disassembled or
  ~ decompiled, without express written authorization from Stratio Big Data Inc., Sucursal en España.
  -->

<!--

    © 2017 Stratio Big Data Inc., Sucursal en España. All rights reserved

    This software is a modification of the original software mesosphere/dcos-kafka-service licensed under the
    Apache 2.0 license, a copy of which is included in root folder. This software contains proprietary information of
    Stratio Big Data Inc., Sucursal en España and may not be revealed, sold, transferred, modified, distributed or
    otherwise made available, licensed or sublicensed to third parties; nor reverse engineered, disassembled or
    decompiled, without express written authorization from Stratio Big Data Inc., Sucursal en España.

-->
<Configuration status="INFO">
	<Properties>
		<Property name="logLevel">INFO</Property>
	</Properties>
	<Appenders>
		<Console name="Console" target="SYSTEM_OUT">
			<PatternLayout pattern="%highlight{%.20c{1}} - %highlight{%m}%n" />
		</Console>
		<Console name="Hooks" target="SYSTEM_OUT">
			<PatternLayout pattern="%highlight{%.20c{1} - %msg%n}{INFO=cyan}"/>
		</Console>
	</Appenders>
	<Loggers>
		<Root level="${sys:logLevel}">
			<AppenderRef ref="Console"/>
		</Root>
		<logger name="com.stratio.tests.utils" level="${sys:logLevel}" additivity="false">
            <appender-ref ref="Hooks"/>
        </logger>
	</Loggers>
</Configuration>
