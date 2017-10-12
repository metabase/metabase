import React from 'react'
import Icon from 'metabase/components/Icon'
import { Link } from 'react-router'

const ITEM_CLASSES = 'flex align-center p2 text-brand-hover no-decoration cursor-pointer'

const LinkMenuItem = ({ children, link }) =>
    <Link className={ITEM_CLASSES} to={link}>
        {children}
    </Link>

const ActionMenuItem = ({ children, action }) =>
    <div className={ITEM_CLASSES} onClick={action}>
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

    const content = [
        <Icon name={icon} className="mr1" />,
        <span className="text-bold">{title}</span>
    ]

    if(link) {
        return (
            <LinkMenuItem link={link}>
                {content}
            </LinkMenuItem>
        )
    }
    if(action) {
        return (
            <ActionMenuItem action={action}>
                {content}
            </ActionMenuItem>
        )
    }
}

export default EntityMenuItem
