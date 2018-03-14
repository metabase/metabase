/*
 * © 2017. Stratio Big Data Inc., Sucursal en España. All rights reserved.
 *
 * This software – including all its source code – contains proprietary information of Stratio Big Data Inc.,
 * Sucursal en España and may not be revealed, sold, transferred, modified, distributed or otherwise made
 * available, licensed or sublicensed to third parties; nor reverse engineered, disassembled or decompiled
 * without express written authorization from Stratio Big Data Inc., Sucursal en España.
 */

package com.stratio.performance.tests

import com.stratio.performance.common.Common
import com.stratio.performance.configurations._
import io.gatling.core.Predef._
import io.gatling.core.body.Body
import io.gatling.http.Predef._

//class Test_Perf10Users30MinutesLowActivityHBase extends GenericTest with Test_10Users with Test_30MinutesDuration
//    with Test_Concurrent15SecondsUsersIncrement with Test_LowLoad with Test_HBaseQuery {
class Test_Perf10Users30MinutesLowActivityHBase extends Simulation with Common with Test_10Users
    with Test_30MinutesDuration with Test_Concurrent15SecondsUsersIncrement with Test_LowLoad with Test_HBaseQuery {

//  override val injectSteps: Seq[io.gatling.core.controller.inject.InjectionStep] = Seq(
//    rampUsers(maxUsers) over usersRampUpTime
//  )
//
//  override val executionName: String = "Launch HBase QUERY - test"
//
//  override val scenarioName: String = "Scenario_" + this.getClass.getSimpleName
//
//  setUp(
//    scenarioBuilder.inject(injectSteps:_*)
//  ).protocols(httpProtocolBuilder)

  val executionName: String = "Launch HBase QUERY - test"

  val scenarioName: String = "Scenario_" + this.getClass.getSimpleName

  val httpProtocolBuilder = http
    .baseURL(baseURL)
    .acceptHeader(acceptHeader)
    .acceptCharsetHeader(acceptCharsetHeader)
    .acceptEncodingHeader(acceptEncodingHeader)
    .contentTypeHeader(contentTypeHeader)

  val commonHeaders = Map(
    "Cookie" -> cookie)

  val body: Body = StringBody(query)

  val start = System.currentTimeMillis

  val scenarioBuilder = scenario(scenarioName)
    .repeat(numRepetitionsByUser) {
      asLongAs(session => (System.currentTimeMillis - start) < maxDuration.toMillis) {
        exec(
          http(executionName)
            .post(queryEndpoint)
            .body(body)
            .headers(commonHeaders)
            .check(status.is(checkStatus))
        ).pause(pauseTime)
      }
    }

  setUp(
    scenarioBuilder.inject(rampUsers(maxUsers) over usersRampUpTime)
  ).protocols(httpProtocolBuilder)

}
