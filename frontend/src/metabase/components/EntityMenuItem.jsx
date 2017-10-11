import React from 'react'
import Icon from 'metabase/components/Icon'

const EntityMenuItem = ({
    action,
    title,
    icon
}) =>
    <div className="flex align-center px2 py1 text-brand-hover cursor-pointer" onClick={action}>
        <Icon name={icon} className="mr1" />
        {title}
    </div>

export default EntityMenuItem
