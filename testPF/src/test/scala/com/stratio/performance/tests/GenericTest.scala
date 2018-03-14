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
import io.gatling.core.Predef._
import io.gatling.core.body.Body
import io.gatling.http.Predef._

trait GenericTest extends Simulation with Common {

  def injectSteps: Seq[io.gatling.core.controller.inject.InjectionStep]
  def executionName: String
  def scenarioName: String

/*
 * TO-DO
 */
//  before {
//  }

  def httpProtocolBuilder = http
    .baseURL(baseURL)
    .acceptHeader(acceptHeader)
    .acceptCharsetHeader(acceptCharsetHeader)
    .acceptEncodingHeader(acceptEncodingHeader)
    .contentTypeHeader(contentTypeHeader)

  def commonHeaders = Map(
    "Cookie" -> cookie)

  def body: Body = StringBody(query)

  def start = System.currentTimeMillis

  def scenarioBuilder = scenario(scenarioName)
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

//  setUp(
//    scenarioBuilder.inject(injectSteps:_*)
//  ).protocols(httpProtocolBuilder)

/*
 * TO-DO
 */
//  after {
//  }

}
