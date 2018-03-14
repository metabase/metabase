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

trait Test_CrossdataQuery extends Common {

  override val query: String = "{\"database\":2,\"type\":\"query\",\"query\":{\"source_table\":2,\"filter\":[\"CONTAINS\",[\"field-id\",5],\"ern\"]},\"parameters\":[]}"

}
