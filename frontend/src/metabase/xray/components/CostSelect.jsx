import React from 'react'
import cx from 'classnames'
import { Link, withRouter } from 'react-router'

import Icon from 'metabase/components/Icon'
import Tooltip from 'metabase/components/Tooltip'

import COSTS from 'metabase/xray/costs'

const CostSelect = ({ currentCost, location }) => {
    const urlWithoutCost = location.pathname.substr(0, location.pathname.lastIndexOf('/'))
    return (
        <ol className="bordered rounded shadowed bg-white flex align-center overflow-hidden">
            { Object.keys(COSTS).map(cost => {
                const c = COSTS[cost]
                return (
                    <Link
                        to={`${urlWithoutCost}/${cost}`}
                        className="no-decoration"
                        key={cost}
                    >
                        <li
                            key={cost}
                            className={cx(
                                "flex align-center justify-center cursor-pointer bg-brand-hover text-white-hover transition-background transition-text text-grey-2",
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
                    </Link>
                )
            })}
        </ol>
    )
}

export default withRouter(CostSelect)
