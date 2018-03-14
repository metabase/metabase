/*
 * © 2017. Stratio Big Data Inc., Sucursal en España. All rights reserved.
 *
 * This software – including all its source code – contains proprietary information of Stratio Big Data Inc.,
 * Sucursal en España and may not be revealed, sold, transferred, modified, distributed or otherwise made
 * available, licensed or sublicensed to third parties; nor reverse engineered, disassembled or decompiled
 * without express written authorization from Stratio Big Data Inc., Sucursal en España.
 */

package com.stratio.performance.configurations

import com.stratio.performance.common.Common
import scala.concurrent.duration._

trait Test_HighLoad extends Common {

  override val numRepetitionsByUser: Int = 6000
  override val pauseTime: FiniteDuration = 4 seconds

}
