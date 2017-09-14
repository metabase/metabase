import React from 'react'

import ItemLink from 'metabase/xray/components/ItemLink'
import ComparisonHeader from 'metabase/xray/components/ComparisonHeader'

import { XRayPageWrapper } from 'metabase/xray/components/XRayLayout'

const XRayFieldComparison = ({
    itemA,
    itemB,
    cost
}) =>
    <XRayPageWrapper>
        <ComparisonHeader cost={cost} />
        <div className="flex">
            <ItemLink
                item={itemA}
                link=''
            />
            <ItemLink
                item={itemB}
                link=''
            />
        </div>
    </XRayPageWrapper>

export default XRayFieldComparison
