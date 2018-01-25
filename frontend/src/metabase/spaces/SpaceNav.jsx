import React from 'react'
import { Collapse } from 'react-collapse'
import { Link } from 'react-router'

const SpaceNav = ({ space, isOpen }) =>
    <div>
        <div>
            <Link to={`/${space.slug}`}><h3>{space.name}</h3></Link>
        </div>
        <Collapse isOpened={isOpen}>
            <ol>
                <li><Link to={`/${space.slug}/dashboards`}>Dashboards</Link></li>
                <li><Link to={`/${space.slug}/pulses`}>Pulses</Link></li>
                <li><Link to={`/${space.slug}/metrics`}>Metrics</Link></li>
                <li><Link to={`/${space.slug}/segments`}>Segments</Link></li>
                <li><Link to={`/${space.slug}/questions`}>Questions</Link></li>
            </ol>
        </Collapse>
    </div>

export default SpaceNav
