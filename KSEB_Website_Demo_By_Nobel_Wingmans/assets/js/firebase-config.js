// Firebase Configuration
// Replace these values with your actual Firebase project configuration
const firebaseConfig = {
  // You need to provide your Firebase project configuration here
  // Get this from Firebase Console > Project Settings > General > Your apps
  apiKey: "AIzaSyAY9XdHIYjWTE9n4x90s7pr-lwLJ7JAfNE",
  authDomain: "kesb-demo---shield.firebaseapp.com",
  databaseURL: "https://kesb-demo---shield-default-rtdb.firebaseio.com", // This is the Realtime Database URL
  projectId: "kesb-demo---shield",
  storageBucket: "kesb-demo---shield.firebasestorage.app",
  messagingSenderId: "526943058920",
  appId: "1:526943058920:web:82719a774899491732425d"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Export for use in other files
window.FirebaseDB = database;


