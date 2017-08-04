import React from 'react'
import cx from 'classnames'

import Icon from 'metabase/components/Icon'
import Tooltip from 'metabase/components/Tooltip'

import COSTS from 'metabase/xray/costs'

const CostSelect = ({ currentCost, onChange }) =>
    <ol className="bordered rounded shadowed bg-white flex align-center overflow-hidden">
        { Object.keys(COSTS).map(cost => {
            const c = COSTS[cost]
            return (
                <li
                    key={cost}
                    onClick={() => onChange(cost)}
                    className={cx(
                        "flex align-center justify-center cursor-pointer bg-brand-hover text-white-hover transition-background transition-text",
                        { 'bg-brand text-white': currentCost === cost }
                    )}
                >
                    <Tooltip
                        tooltip={c.description}
                    >
                        <Icon
                            size={32}
                            name={c.icon}
                            className="p1 border-right"
                        />
                    </Tooltip>
                </li>
            )
        })}
    </ol>

export default CostSelect
