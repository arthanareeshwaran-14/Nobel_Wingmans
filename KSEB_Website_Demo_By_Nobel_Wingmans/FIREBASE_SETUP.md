# Firebase Real-time Data Integration

## Setup Instructions

### 1. Firebase Configuration
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select existing project
3. Enable Realtime Database
4. Get your database URL (it looks like: `https://your-project-id-default-rtdb.firebaseio.com/`)

### 2. Update Firebase Config
Edit `assets/js/firebase-config.js` and replace the placeholder values with your actual Firebase project configuration:

```javascript
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project-id.firebaseapp.com",
  databaseURL: "https://your-project-id-default-rtdb.firebaseio.com/",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
};
```

### 3. Firebase Data Structure
Your Firebase Realtime Database should have data in this format:

```json
{
  "sensorData": {
    "voltage": 230.5,
    "current": 1.2,
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

### 4. Using the Website
1. Open the website
2. On the Live Data page, you'll see a Firebase Configuration section
3. Enter your Firebase Realtime Database URL
4. Click "Connect to Firebase"
5. The status will show if connection is successful
6. Real-time data will automatically update the voltage and current readings

### 5. Data Field Mapping
The system expects these fields in your Firebase data:
- `voltage`: Numeric value for voltage reading
- `current`: Numeric value for current reading  
- `timestamp`: ISO timestamp string (optional)

### 6. Security Rules
For testing, you can use these Firebase security rules:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

**Note**: These rules allow anyone to read/write. For production, implement proper authentication and security rules.

### 7. Fallback Mode
If Firebase is not configured or connection fails, the system will automatically fall back to simulation mode with dummy data.

## Troubleshooting

- **Connection Failed**: Check your Firebase URL and security rules
- **No Data**: Verify your Firebase data structure matches the expected format
- **Simulation Mode**: If you see simulation data, Firebase connection failed and system is using fallback mode

