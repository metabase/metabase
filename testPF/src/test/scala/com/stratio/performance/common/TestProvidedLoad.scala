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

trait TestProvidedLoad extends Common {

  override val numRepetitionsByUser: Int = System.getProperty("NUM_REPETITIONS", "1").toInt
  override val pauseTime: FiniteDuration = Option(System.getProperty("PAUSE_TIME_AMOUNT")).map(_.toInt).map {
    x => getFiniteDuration(x, System.getProperty("PAUSE_TIME_MAGNITUDE"))
  }.getOrElse(1 seconds)

}
