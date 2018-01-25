import React, { Component } from 'react'
import cxs from 'cxs'
import SpaceNav from './SpaceNav'
import { connect } from 'react-redux'

const SIDEBAR_STYLE = cxs({
    backgroundColor: '#F4F5F6',
    flex: '0 0 22%',
    height: '100%',
    padding: '2em',
    position: 'relative'
})

const LOGO_STYLE = cxs({
    width: '2.5em',
    height: '2.5em',
    borderRadius: '6px',
    backgroundColor: '#DCE1E4',
    transform: 'rotate(45deg)'
})

const SIDEBAR_ITEM_STYLE = cxs({
    border: '1px solid #DCE1E4',
    borderRadius: '4px',
    marginBottom: '1em'
})

const SECONDARY_NAV_STYLE = cxs({
    position: 'absolute',
    bottom: 0
})

const Logo = () => {
    return (
        <div className={LOGO_STYLE}></div>
    )
}

class Sidebar extends Component {
    render () {

        const { spaces } = this.props

        return (
            <nav className={SIDEBAR_STYLE}>
                <Logo />
                <h2>Hey there, Kyle</h2>
                <ol>
                    { spaces.map(space =>
                        <li className={SIDEBAR_ITEM_STYLE} key={space.id}>
                            <SpaceNav space={space} isOpen={this.props.space === space.slug} />
                        </li>
                    )}
                </ol>

                <ol className={SECONDARY_NAV_STYLE}>
                    <li>New question</li>
                    <li>Activity</li>
                    <li>
                        <div>
                            <h5>Settings</h5>
                        </div>
                    </li>
                </ol>

            </nav>
        )
    }

}

const mapStateToProps = (state) => ({
    spaces: state.spaces
})

export default connect(mapStateToProps)(Sidebar)
