// ============================================
// FIREBASE CONFIG — fill this in with your own project's values
// Get these from: Firebase Console → Project Settings → General → Your apps → SDK setup
// ============================================
const firebaseConfig = {
  apiKey: "AIzaSyAunlNZOiyv1kp_FAbCAP0ddcnaayeRA3k",
  authDomain: "turf-booking-7f9b5.firebaseapp.com",
  projectId: "turf-booking-7f9b5",
  storageBucket: "turf-booking-7f9b5.firebasestorage.app",
  messagingSenderId: "567900199393",
  appId: "1:567900199393:web:0b1b23a25e13c435599aa0",
  measurementId: "G-KMDNQ8LJF1",
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ============================================
// HOST PASSWORD — change this to whatever 6-digit code you want to give your group
// Anyone who knows this can create games and unlock host controls
// ============================================
const HOST_PASSWORD = "696969";