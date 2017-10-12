import React from 'react'
import Icon from 'metabase/components/Icon'
import { Link } from 'react-router'

const LinkMenuItem = ({ children, link }) =>
    <Link to={link}>
        {children}
    </Link>

const ActionMenuItem = ({ children, action }) =>
    <div className="flex align-center px2 py1 text-brand-hover cursor-pointer" onClick={action}>
        {children}
    </div>

const EntityMenuItem = ({
    action,
    title,
    icon,
    link
}) => {
    if(link && action) {
        console.warn('EntityMenuItem Error: You cannot specify both action and link props')
        return <div></div>
    }

    if(link) {
        return (
            <LinkMenuItem link={link}>
                <Icon name={icon} className="mr1" />
                {title}
            </LinkMenuItem>
        )
    }
    if(action) {
        return (
            <ActionMenuItem action={action}>
                <Icon name={icon} className="mr1" />
                {title}
            </ActionMenuItem>
        )
    }
}

export default EntityMenuItem
