interface HeaderProps {
  isLoggedIn: boolean;
  userEmail: string;
  onLogin: () => void;
  onRegister: () => void;
  onLogout: () => void;
}

export default function Header({
  isLoggedIn,
  userEmail,
  onLogin,
  onRegister,
  onLogout
}: HeaderProps) {
  return (
    <div className="absolute top-4 right-4 flex items-center gap-4">
      {isLoggedIn && (
        <span className="text-gray-600">Welcome, {userEmail}</span>
      )}
      <button
        onClick={isLoggedIn ? onLogout : onLogin}
        className="py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 font-medium"
      >
        {isLoggedIn ? 'Log Out' : 'Login'}
      </button>
      {!isLoggedIn && (
        <button
          onClick={onRegister}
          className="py-2 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200 font-medium"
        >
          Register
        </button>
      )}
    </div>
  );
} 
