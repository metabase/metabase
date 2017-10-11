import React from 'react'
import Icon from 'metabase/components/Icon'

const EntityzMenuTrigger = ({ icon, onClick }) =>
    <div onClick={onClick} className="flex align-center justify-center cursor-pointer">
        <Icon name={icon} />
    </div>

export default EntityzMenuTrigger
