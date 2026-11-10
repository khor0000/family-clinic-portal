# Family Clinic Portal

I run a small family clinic with three doctors. I want a website where my patients can sign up, book an appointment with a doctor, see their upcoming and past appointments, and cancel or move them. Patients should be able to upload a referral letter (PDF or photo) when they book. After the visit, the doctor writes a short note and the patient can read it in their account. Doctors should see their own schedule for the day. My receptionist needs an admin page to add or remove doctors, see all bookings, and tick when a patient has paid the RM50 deposit. It should look clean and simple, and work on phones.

My friend said I should use Supabase for the database.

Accounts: user_a, user_b (patients); doctor_1, doctor_2 (doctors); admin (receptionist/admin) — all @test.local. Sample data: user_a has 2 appointments with doctor_1 (1 past with a visit note, 1 upcoming with a referral file); user_b has 1 upcoming appointment with doctor_2.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/db76e2d9-812a-4a0e-bf04-2dac0585bba7).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
