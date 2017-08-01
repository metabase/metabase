import React from 'react'
import Tooltip from 'metabase/components/Tooltip'
import Icon from 'metabase/components/Icon'

const SimpleStat = ({ stat, showDescription }) =>
    <div>
        { /* call toString to ensure that values like true / false show up */ }
        <h1>{stat.value.toString()}</h1>
        <div className="flex align-center">
            <h3 className="mr1">{stat.label}</h3>
            { showDescription && (
                <Tooltip tooltip={stat.description}>
                    <Icon name='infooutlined' />
                </Tooltip>
            )}
        </div>
    </div>

export default SimpleStat

