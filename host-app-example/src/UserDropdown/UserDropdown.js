import "./UserDropdown.css"

export function UserDropdown({ onClick }) {
  return (
    <div className="UserDropdown--container">
      <img
        className="UserDropdown--avatar"
        src="https://api.dicebear.com/7.x/pixel-art/svg"
        alt="John Doe"
      />
      <div className="dropdown-menu UserDropdown--logout-container">
        <button className="UserDropdown--logout-button" onClick={onClick}>
          Logout
        </button>
      </div>
    </div>
  );
}
