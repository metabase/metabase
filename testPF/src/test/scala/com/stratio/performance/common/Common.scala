/*
 * © 2017. Stratio Big Data Inc., Sucursal en España. All rights reserved.
 *
 * This software – including all its source code – contains proprietary information of Stratio Big Data Inc.,
 * Sucursal en España and may not be revealed, sold, transferred, modified, distributed or otherwise made
 * available, licensed or sublicensed to third parties; nor reverse engineered, disassembled or decompiled
 * without express written authorization from Stratio Big Data Inc., Sucursal en España.
 */

package com.stratio.performance.common

import scala.concurrent.duration._

trait Common extends CommonUsers with CommonUsersIncrement with CommonDuration with CommonLoad with CommonQuery {

  val baseURL: String = System.getProperty("BASE_URL", "https://discovery.labs.stratio.com/services/metabase")
  val queryEndpoint: String = System.getProperty("QUERY_ENDPOINT", "/api/dataset")
  val cookie: String = System.getProperty("COOKIE", "metabase.SESSION_ID=30e3abe9-b94a-45aa-99c7-15f3fbf7e01e; _ga=GA1.2.348703961.1520930912; _gid=GA1.2.140254666.1520930912; _gat=1")
  val checkStatus: Int = System.getProperty("CHECK_STATUS", "200").toInt
  val acceptHeader: String = System.getProperty("ACCEPT_HEADER", "application/json")
  val acceptCharsetHeader: String = System.getProperty("ACCEPT_CHARSET_HEADER", "UTF-8")
  val acceptEncodingHeader: String = System.getProperty("ACCEPT_ENCODING_HEADER", "gzip")
  val contentTypeHeader: String = System.getProperty("CONTENT_TYPE_HEADER", "application/json")

  private[stratio] def getFiniteDuration(amount: Int, magnitude: String) = magnitude match {
    case "seconds" => amount.seconds
    case "minutes" => amount.minutes
    case "hours" => amount.hours
    case _ => amount.seconds
  }

}
