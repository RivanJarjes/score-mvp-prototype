interface LoadingSpinnerProps {
  message?: string;
}

export default function LoadingSpinner({ message = "Loading..." }: LoadingSpinnerProps) {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-gray-500">{message}</div>
    </div>
  );
} 
