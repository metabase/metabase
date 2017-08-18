import React from 'react'

import Icon from 'metabase/components/Icon'
import CostSelect from 'metabase/xray/components/CostSelect'

const ComparisonHeader = ({ cost }) =>
    <div className="my4 flex align-center">
        <h1 className="flex align-center">
            <Icon name="compare" className="mr1" size={32} />
            Comparing
        </h1>
        <div className="ml-auto">
            <CostSelect
                currentCost={cost}
            />
        </div>
    </div>

export default ComparisonHeader
