import React from 'react'

import COSTS from 'metabase/xray/costs'
import Select, { Option } from 'metabase/components/Select'

const CostSelect = ({currentCost, onChange}) =>
    <Select
        value={currentCost}
        onChange={onChange}
    >
        { Object.keys(COSTS).map(cost =>
            <Option value={cost} key={cost}>
                {COSTS[cost].display_name}
            </Option>
        )}
    </Select>

export default CostSelect
