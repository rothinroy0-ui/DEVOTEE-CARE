# ISKCON Devotee CARE Portal 🪷

> *"Our love for Krishna will be tested by how we love and care for one another."*  
> — **His Divine Grace A.C. Bhaktivedanta Swami Prabhupada**

A professional, secure, and modern congregation management and logistics platform custom-built for the **ISKCON Devotee Care Department** (Durgapur Sri Sri Radha Madhava Mandir & Nationwide Congregation). It unifies complete devotee profiling for **824 devotees**, an interactive **Birthday & Vivaha Anniversary Wish Dashboard**, a **Flipkart/Amazon-Style Prasadam Parcel Tracking System**, and pastoral welfare case management.

---

## 🌟 Key Functional Modules

### 1. 🎂 Devotee Birthday & Anniversary Wish Dashboard
- **824 Devotee Master Integration**: Pre-loaded with complete profiles, legal names, initiated names, spouse names, exact birth dates, and wedding anniversaries.
- **Month Selector & Timeframe Windows**:
  - Filter by any month of the year (**April (Month Focus)**, January through December, or **All Year (824 Devotees)**).
  - Timeframe toggles: **Today**, **Tomorrow**, **Next 7 Days**, **This Month**, or **All Year**.
- **Multi-Event Type Filtering**:
  - 🎂 **Appearance Day (Birthday)** wishes with calculated age milestones (e.g. *Turning 56 Years*).
  - 💍 **Vivaha (Marriage) Anniversaries** honoring Grihastha couples with milestone years (e.g. *40 Years of Grihastha Harmony*).
  - 🪷 **Diksa (Harinama / Brahmana) Anniversaries**.
- **1-Click Personalized WhatsApp Blessing Generator**:
  - Authentic Vaishnava greetings quoting Srila Prabhupada and the Hare Krishna Maha-Mantra.
  - Automatically addresses devotee by their spiritual name, legal name, and spouse name.
  - Direct integration with WhatsApp (`https://wa.me/`) for instant dispatch.
- **🎨 Festive Visual Greeting Card Generator**:
  - Creates a high-resolution Vedic greeting card with devotee photo in an ornate golden frame, garland, peacock feather, Om emblems, Prabhupada quote, and the Maha-Mantra.
  - **1-Click Download as PNG Image** via HTML5 Canvas.
  - 1-Click "Share on WhatsApp" and "Copy Wish Text".
- **View Mode Switcher**:
  - Toggle between rich **Card Grid View** and high-density **Celebration Table View**.
- **Interactive Parcel Tracking Pill**:
  - Every birthday/anniversary card displays the current Flipkart/Amazon shipping status (`Delivered ✅`, `In Transit 🚚`, `Out for Delivery 🛵`, `Altar Packed 📦`). Clicking the badge opens the live Flipkart/Amazon tracking modal!

---

### 2. 🚚 Flipkart & Amazon-Style Parcel Tracking System
Dedicated logistics module designed to mirror the tracking experience of major e-commerce platforms like **Flipkart** and **Amazon**, tailored for sacred temple gifts (Maha-Prasadam peda, Bhagavad-gita As It Is, Tulasi beads, calendars, and birthday scrolls):
- **Hero Consignment Search**:
  - Search instantaneously by **Consignment Tracking ID** (e.g. `ISK713204-001`), **Devotee ID**, **Name**, or **Mobile Number**.
- **Visual 5-Stage Flipkart / Amazon Stepper**:
  1. 🛒 **Gift Requisition Approved**: Appearance day gift requisition registered by Devotee Care Desk.
  2. 🎁 **Altar Packed & Sanctified**: Sealed in moisture-barrier container and sanctified with sacred Tulasi at Sri Sri Radha Madhava Altar.
  3. 🚚 **Dispatched — In Transit**: Handed over to courier partner (Blue Dart, India Post Speed Post, DTDC, Delhivery, ISKCON Seva Express); hub scans recorded.
  4. 🛵 **Out for Delivery**: Local delivery associate en route to devotee's address with contact number.
  5. 🏡 **Delivered & Blessed**: Successfully handed to devotee with confirmation.
- **Live Scans Timeline History**:
  - Timestamped chronological scans with facility locations (Durgapur Temple, Asansol Hub, Local Delivery Hub).
- **Delivery Associate Details**:
  - Associate name and mobile number with 1-click **Call Agent** and **WhatsApp**.
- **Printable Amazon / Flipkart 4x6" Shipping Labels**:
  - Complete with Barcode (`||||||||||||||||`), QR Code, consignee address, sender address, routing hub code, 28px large PIN code, and "FRAGILE: HOLY MAHA-PRASADAM" warning banner.
- **Address Verification Workflow**:
  - Detects incomplete addresses or missing PIN codes.
  - 1-Click **"Verify Address on WhatsApp"** button sending a pre-composed courteous message asking the devotee to confirm their delivery address and PIN code.
  - Inline **Edit Address & Consignment Modal** with persistent localStorage saving.
- **Bulk Logistics Operations**:
  - **Batch Dispatch Month's Parcels**: 1-click mark all birthday gifts for the selected month as Dispatched (`IN_TRANSIT`).
  - **Bulk Print Shipping Labels**: Print a batch of shipping labels for postal dispatch.
  - **Export Courier Logistics Manifest**: Generate Excel (`.xlsx`) sheet via SheetJS for Blue Dart / India Post pickup.

---

### 3. 📊 Executive Vaishnava Care Dashboard
- **Real-Time KPIs**: Total Congregation (824), Birthdays This Month, Anniversaries This Month, Active Care Cases, Senior Vaishnavas (Age 60+).
- **Logistics Status Doughnut Chart**: Live breakdown of Delivered, Out for Delivery, In Transit, and Altar Packed consignments.
- **Ashrama Distribution & Care Pillars Charts**: Powered by Chart.js.
- **Live Tri-Widget Grid**:
  1. *Upcoming Celebrations* (Next 14 Days) with direct WhatsApp wish button.
  2. *Prasadam Logistics Tracker* with quick live tracking link.
  3. *Recent Care Cases* with priority triage.

---

### 4. 👥 Devotee Congregation Directory (824 Master Records)
- Full searchable directory of all 824 devotees with multi-filters by Ashrama, Initiation level, and keyword.
- Detailed Bio-Data Profile Modal with printable Vaishnava bio sheet.
- Direct phone and WhatsApp quick actions.

---

### 5. ❤️ Care & Welfare Desk (12 Pillars of Devotee Care)
- Register, approve, and track medical relief grants, hospitalization support, senior devotee care, and pastoral counseling.

---

### 6. 💾 Data Management, Sync & Privacy
- **100% Client-Side Privacy**: Data stays in your browser's LocalStorage / IndexedDB.
- **1-Click Sync Master Devotees**: Easily reload all 824 master records anytime.
- **JSON Backup & Restore**: Snapshot and restore full database anytime.
- **Multi-Sheet Excel Export**: Devotee directory, parcel manifests, and celebration schedules.

---

## 🚀 How to Run the Portal

1. **Option A (Instant 1-Click)**:
   - Double-click `start-portal.bat` or `index.html`.
   - The portal will immediately launch in Google Chrome, Microsoft Edge, or your default browser.

2. **Option B (PowerShell)**:
   ```powershell
   Start-Process "index.html"
   ```

*No Node.js, Python, or external database server is required — runs 100% standalone and offline.*

### ☁️ Deploy to Vercel & Link Supabase Login

The portal ships with Supabase email/password login built in. To put it live on Vercel —
set the `SUPABASE_URL` / `SUPABASE_ANON_KEY` environment variables, configure the
Authentication Site URL in Supabase, and deploy — follow the step-by-step guide in
[**`DEPLOYMENT.md`**](./DEPLOYMENT.md).

---

*Dedicated to the loving service of the Vaishnavas and His Divine Grace A.C. Bhaktivedanta Swami Prabhupada.*
