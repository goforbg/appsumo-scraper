import { NextResponse } from "next/server";
import puppeteer from "puppeteer";
import { MongoClient } from "mongodb";
import nodemailer from "nodemailer";
const NAVIGATION_TIMEOUT = 60000;
const MONGODB_URI = process.env.MONGODB_URI;
const EMAIL_CONFIG = {
  host: `smtp.mailazy.com`,
  port: `587`,
  auth: {
    user: `cbutp5enaoi4u6bg395gPeBOdCdanA`,
    pass: `${process.env.MAILZY_SEC}`
  }
};

export async function POST(req) {
  const { url } = await req.json();

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  try {
    console.log(`Starting scrape for URL: ${url}`);
    const productData = await scrapeProduct(url);
    // await sendEmail(productData);

    return NextResponse.json({ success: true, data: productData });
  } catch (error) {
    console.error("Scraping error:", error);
    return NextResponse.json({ error: "Scraping failed" }, { status: 500 });
  }
}

async function scrapeProduct(url) {
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--start-maximized", "--window-size=1920,1080"]
  });
  const page = await browser.newPage();

  await page.setViewport({ width: 1920, height: 1080 });

  console.log("Case 1 - Width  :", page.viewport().width); // Width  : 800
  console.log("Case 1 - Height :", page.viewport().height); // Height : 600

  try {
    console.log("Scraping main product page");
    await page.goto(url, {
      waitUntil: "networkidle0",
      timeout: NAVIGATION_TIMEOUT
    });
    await delay(5000); // 5 second delay
    const productData = await scrapeMainPage(page);

    console.log("Scraping reviews page");
    await page.goto(`${url}/reviews`, {
      waitUntil: "networkidle0",
      timeout: NAVIGATION_TIMEOUT
    });
    await delay(5000); // 5 second delay
    const reviewsData = await scrapeReviewsPage(page);

    console.log("Scraping questions page");
    await page.goto(`${url}/questions`, {
      waitUntil: "networkidle0",
      timeout: NAVIGATION_TIMEOUT
    });
    await delay(5000); // 5 second delay
    const questionsData = await scrapeQuestionsPage(page);

    // Here's where we combine all the data into a single object
    const finalData = {
      ...productData,
      total_rating: reviewsData.total_rating,
      total_num_reviews: reviewsData.total_num_reviews,
      taco_ratings: reviewsData.taco_ratings,
      reviews: reviewsData.reviews,
      questions: questionsData
    };

    console.log("Scraping completed");
    await saveToDatabase(finalData);
    return finalData;
  } catch (error) {
    console.error("Error during scraping:", error);
    throw error;
  } finally {
    await browser.close();
  }
}

async function scrapeMainPage(page) {
  return await page.evaluate(() => {
    const safeQuerySelector = (selector) =>
      document.querySelector(selector) || null;
    const getFloat = (selector) => {
      const element = safeQuerySelector(selector);
      return element
        ? parseFloat(element.innerText.replace(/[^0-9.-]+/g, "") || "0")
        : 0;
    };
    const getText = (selector) => {
      const element = safeQuerySelector(selector);
      return element ? element.innerText.trim() : "";
    };
    const getArray = (selector) =>
      Array.from(document.querySelectorAll(selector)).map((el) =>
        el.innerText.trim()
      );
    const getHref = (selector) => {
      const element = safeQuerySelector(selector);
      return element ? element.href : "";
    };

    return {
      product_images: Array.from(
        document.querySelectorAll('img[class^="story-inline-image"]')
      ).map((img) => img.src),
      product_title: getText("h1"),
      product_tldr: getText(
        "#headlessui-portal-root > div > div.mx-auto.my-2.w-full.max-w-7xl.grow.px-4.md\\:my-6.md\\:px-8 > article > main > div > section:nth-child(4) > div.flex.flex-col.rounded.bg-gray-100.px-4"
      ),
      at_a_glance_best_for: getText(
        "#headlessui-portal-root > div > div.mx-auto.my-2.w-full.max-w-7xl.grow.px-4.md\\:my-6.md\\:px-8 > article > main > div > section:nth-child(5) > div > div:nth-child(1) > div > ul"
      ).replaceAll("\n", ","),
      at_a_glance_integrations: getText(
        "#headlessui-portal-root > div > div.mx-auto.my-2.w-full.max-w-7xl.grow.px-4.md\\:my-6.md\\:px-8 > article > main > div > section:nth-child(5) > div > div:nth-child(2) > div > ul"
      ).replaceAll("\n", ","),
      at_a_glance_features: getText(
        "#headlessui-portal-root > div > div.mx-auto.my-2.w-full.max-w-7xl.grow.px-4.md\\:my-6.md\\:px-8 > article > main > div > section:nth-child(5) > div > div:nth-child(3) > div > ul"
      ).replaceAll("\n", ","),
      product_description: getText(
        'section[id="overview"] > div[class="prose"]'
      ),
      product_features: getText('section[id="pricePlans"]'),
      product_website: getHref('div[class="prose"] > p > a'),
      product_price_starts_at: getFloat(
        "#headlessui-portal-root > div > div> article > main > aside > div > div > div > div > div > div.flex.flex-col > div:nth-child(1) > div > span:nth-child(2)"
      ),
      number_of_reviews: getFloat(
        "#headlessui-portal-root > div > div > article > main > aside > div > div > div > div > div:nth-child(5) > div > span > div > a > span"
      ),
      product_yt_vid: getHref('a[href^="https://www.youtube.com"]'),
      plan_1_price: getFloat(
        "#headlessui-portal-root > div > div.mx-auto.my-2.w-full.max-w-7xl.grow.px-4.md\\:my-6.md\\:px-8 > article > footer > div.appsumo-style-links.mx-auto.mb-8.max-w-7xl > div > div:nth-child(1) > div > div > div > div.flex.flex-col.text-center.pb-4 > div > strong"
      ),
      plan_1_features: getArray(
        "#headlessui-portal-root > div > div.mx-auto.my-2.w-full.max-w-7xl.grow.px-4.md\\:my-6.md\\:px-8 > article > footer > div.appsumo-style-links.mx-auto.mb-8.max-w-7xl > div > div:nth-child(1) > div > div > div > div.px-2.pb-6 > ul > li > span > b"
      ),
      plan_2_price: getFloat(
        "#headlessui-portal-root > div > div.mx-auto.my-2.w-full.max-w-7xl.grow.px-4.md\\:my-6.md\\:px-8 > article > footer > div.appsumo-style-links.mx-auto.mb-8.max-w-7xl > div > div:nth-child(2) > div > div > div > div.flex.flex-col.text-center.pb-4 > div > strong"
      ),
      plan_2_features: getArray(
        "#headlessui-portal-root > div > div.mx-auto.my-2.w-full.max-w-7xl.grow.px-4.md\\:my-6.md\\:px-8 > article > footer > div.appsumo-style-links.mx-auto.mb-8.max-w-7xl > div > div:nth-child(2) > div > div > div > div.px-2.pb-6 > ul > li > span > b"
      ),
      plan_3_price: getFloat(
        "#headlessui-portal-root > div > div.mx-auto.my-2.w-full.max-w-7xl.grow.px-4.md\\:my-6.md\\:px-8 > article > footer > div.appsumo-style-links.mx-auto.mb-8.max-w-7xl > div > div:nth-child(3) > div > div > div > div.flex.flex-col.text-center.pb-4 > div > strong"
      ),
      plan_3_features: getArray(
        "#headlessui-portal-root > div > div.mx-auto.my-2.w-full.max-w-7xl.grow.px-4.md\\:my-6.md\\:px-8 > article > footer > div.appsumo-style-links.mx-auto.mb-8.max-w-7xl > div > div:nth-child(3) > div > div > div > div.px-2.pb-6 > ul > li > span > b"
      ),
      founder_name: getText(
        "#from-the-founders > div > div > div.flex.gap-x-6.grid-in-founder > div.flex.flex-col > a > h4"
      ),
      founder_title: getText(
        "#from-the-founders > div > div > div.flex.gap-x-6.grid-in-founder > div.flex.flex-col > div:nth-child(2)"
      ),
      founder_url: getHref(
        "#from-the-founders > div > div > div.flex.gap-x-6.grid-in-founder > div:nth-child(1) > a"
      ),
      company_faq: getText(
        "#from-the-founders > div > div > div.flex.flex-col.gap-y-6.grid-in-body > div > div"
      ),
      company_links: Array.from(
        document.querySelectorAll(
          "#from-the-founders > div > div > div.flex.flex-col.gap-y-4.grid-in-links > div:nth-child(2) > ul > li > a"
        )
      ).map((a) => a.href)
    };
  });
}

async function scrapeReviewsPage(page) {
  const allReviews = []; // This will hold all unique reviews across all pages
  let hasNextPage = true;
  let pageNum = 1;
  let totalRating, totalNumReviews, tacoRatings;

  while (hasNextPage) {
    console.log(`Scraping reviews page ${pageNum}`);
    try {
      const pageReviews = await page.evaluate(() => {
        const safeQuerySelector = (selector) =>
          document.querySelector(selector) || null;
        const getFloat = (selector) => {
          const element = safeQuerySelector(selector);
          return element
            ? parseFloat(element.innerText.replace(/[^0-9.-]+/g, "") || "0")
            : 0;
        };
        const getText = (selector) => {
          const element = safeQuerySelector(selector);
          return element ? element.innerText.trim() : "";
        };

        const totalRating = getFloat(
          "#headlessui-portal-root > div > article > aside > div.hidden.lg\\:block > div > div.flex.flex-col.items-center.justify-center.gap-4.rounded.border.border-gravel.p-3 > h3"
        );
        const totalNumReviews = getFloat(
          "#headlessui-portal-root > div > article > aside > div.hidden.lg\\:block > div > div.flex.flex-col.items-center.justify-center.gap-4.rounded.border.border-gravel.p-3 > p"
        );

        const tacoRatings = {
          five_stars: getFloat(
            "#headlessui-portal-root > div > article > aside > div.hidden.lg\\:block > div > div.mt-6.rounded.border.border-gravel.p-4 > div > strong:nth-child(3)"
          ),
          four_stars: getFloat(
            "#headlessui-portal-root > div > article > aside > div.hidden.lg\\:block > div > div.mt-6.rounded.border.border-gravel.p-4 > div > strong:nth-child(6)"
          ),
          three_stars: getFloat(
            "#headlessui-portal-root > div > article > aside > div.hidden.lg\\:block > div > div.mt-6.rounded.border.border-gravel.p-4 > div > strong:nth-child(9)"
          ),
          two_stars: getFloat(
            "#headlessui-portal-root > div > article > aside > div.hidden.lg\\:block > div > div.mt-6.rounded.border.border-gravel.p-4 > div > strong:nth-child(12)"
          ),
          one_star: getFloat(
            "#headlessui-portal-root > div > article > aside > div.hidden.lg\\:block > div > div.mt-6.rounded.border.border-gravel.p-4 > div > strong:nth-child(15)"
          )
        };

        const reviewElements = document.querySelectorAll(
          "#headlessui-portal-root > div > article > div > div:nth-child(3) > div.flex.flex-col.gap-y-4.py-4 > div.flex.flex-col.gap-y-5.sm\\:gap-y-10 > div > div"
        );
        const reviews = Array.from(reviewElements).map((el) => ({
          review_giver: getText(".flex.items-center > a", el),
          review_stars: getFloat(
            "div.w-full.space-y-2 > div:nth-child(1) > div > img",
            el
          ),
          review_giver_deals_bought: getFloat(
            "div.mt-2.flex.flex-wrap.items-center.gap-x-2.gap-y-1.text-sm.text-grace > span:nth-child(3)",
            el
          ),
          review_giver_posted_date: getText(
            "div.mt-2.flex.flex-wrap.items-center.gap-x-2.gap-y-1.text-sm.text-grace > span:nth-child(5)",
            el
          ),
          review_giver_member_since: getText(
            "div.mt-2.flex.flex-wrap.items-center.gap-x-2.gap-y-1.text-sm.text-grace > span:nth-child(1)",
            el
          ),
          review_title: getText("div.w-full.space-y-2 > div.space-y-1 > p", el),
          review_description: getText(
            "div.w-full.space-y-2 > div.space-y-1 > div",
            el
          ),
          review_reply: getText(
            "div.flex.flex-col.items-start.gap-2.self-stretch.rounded-lg.p-4.bg-sky-100 > div:nth-child(3) > div",
            el
          ),
          review_reply_giver: getText(
            "div.flex.flex-col.items-start.gap-2.self-stretch.rounded-lg.p-4.bg-sky-100 > div.flex.items-center.gap-2 > div > div > p",
            el
          ),
          review_reply_date: getText(
            "div.flex.flex-col.items-start.gap-2.self-stretch.rounded-lg.p-4.bg-sky-100 > div.flex.items-center.gap-2 > div > div > span",
            el
          ),
          review_helpful_count: getFloat(
            "div.flex.w-full.items-center.justify-between > div > div > button > span",
            el
          )
        }));

        return {
          totalRating,
          totalNumReviews,
          tacoRatings,
          reviews
        };
      });

      if (pageNum === 1) {
        totalRating = pageReviews.totalRating;
        totalNumReviews = pageReviews.totalNumReviews;
        tacoRatings = pageReviews.tacoRatings;
      }

      if (!pageReviews || pageReviews.reviews.length === 0) {
        console.log(`No reviews found on page ${pageNum}. Stopping.`);
        break;
      }

      // Add only new reviews to allReviews
      pageReviews.reviews.forEach((review) => {
        if (
          !allReviews.some(
            (r) =>
              r.review_giver === review.review_giver &&
              r.review_title === review.review_title
          )
        ) {
          allReviews.push(review);
        }
      });

      hasNextPage = await page.evaluate(() => {
        const nextButton = document.querySelector(
          'a[aria-label="Go to next page"]'
        );

        const end_reached = document.location.href.includes(
          nextButton.href.split("?page=")[1]
        );
        console.log("end reached ::", end_reached);

        if (!end_reached) {
          nextButton.click();
          return true;
        }
        return false;
      });

      if (hasNextPage) {
        console.log(`Moving to next reviews page`);
        await delay(2000); // Extra wait to ensure content is fully loaded
      } else {
        console.log(`End of reviews page reached`);
      }
    } catch (error) {
      console.error(`Error scraping reviews page ${pageNum}:`, error);
      hasNextPage = false;
    }

    pageNum++;
  }

  console.log(`Finished scraping reviews. Total pages: ${pageNum - 1}`);
  return {
    total_rating: totalRating,
    total_num_reviews: totalNumReviews,
    taco_ratings: tacoRatings,
    reviews: allReviews
  };
}

async function scrapeQuestionsPage(page) {
  const questions = [];
  let hasNextPage = true;
  let pageNum = 1;

  while (hasNextPage) {
    console.log(`Scraping questions page ${pageNum}`);
    try {
      const pageQuestions = await page.evaluate(() => {
        const safeQuerySelector = (selector) =>
          document.querySelector(selector) || null;
        const getText = (selector, parent = document) => {
          const element = parent.querySelector(selector);
          return element ? element.innerText.trim() : "";
        };

        const questionElements = document.querySelectorAll(
          "#headlessui-portal-root > div > article > div > div:nth-child(2) > div.flex.flex-col.gap-y-4.py-4 > div.flex.flex-col.gap-y-5.sm\\:gap-y-10 > div > div"
        );

        return Array.from(questionElements).map((el) => ({
          question_title: getText("div.space-y-1 > p > span", el),
          question_description: getText(
            "div.space-y-1 > div.text-midnight > div",
            el
          ),
          question_asker: getText(
            "div.space-y-1 > div.flex.flex-wrap.items-center.justify-between.text-sm.text-grace > div > span.truncate.font-semibold",
            el
          ),
          answer: getText(
            "div.flex.flex-col.items-start.gap-2.self-stretch.rounded-lg.p-4.bg-sky-100 > div.first-letter\\:font-bold",
            el
          ),
          answer_giver: getText(
            "div.flex.flex-col.items-start.gap-2.self-stretch.rounded-lg.p-4.bg-sky-100 > div.flex.items-center.gap-2 > div > div > p",
            el
          )
        }));
      });

      if (!pageQuestions || pageQuestions.length === 0) {
        console.log(`No questions found on page ${pageNum}. Stopping.`);
        break;
      }

      questions.push(...pageQuestions);

      hasNextPage = await page.evaluate(() => {
        const end_reached = document.location.href.includes(
          document
            .querySelector('a[aria-label="Go to next page"]')
            .href.split("?page=")[1]
        );
        if (!end_reached) {
          console.log("Contains Next Page");
          const nextButton = document.querySelector(
            'a[aria-label="Go to next page"]'
          );
          nextButton.click();
          return true;
        } else {
          console.log("End Reached");
          return false;
        }
      });

      if (hasNextPage) {
        console.log(`Moving to next questions page`);
        await delay(2000); // Extra wait to ensure content is fully loaded
      }
    } catch (error) {
      console.error(`Error scraping questions page ${pageNum}:`, error);
      hasNextPage = false;
    }

    pageNum++;
  }

  console.log(`Finished scraping questions. Total pages: ${pageNum - 1}`);
  return questions;
}

async function saveToDatabase(data) {
  const client = new MongoClient(MONGODB_URI);
  try {
    console.log(`Saving product data to database`);
    await client.connect();
    const db = client.db();
    const collection = db.collection("products");
    await collection.insertOne(data);
    console.log(`Product data saved successfully`);
  } catch (error) {
    console.error(`Error saving product data to database:`, error);
  } finally {
    await client.close();
  }
}

async function sendEmail(data) {
  console.log("Sending email with scraping results");
  const transporter = nodemailer.createTransport(EMAIL_CONFIG);

  try {
    await transporter.sendMail({
      from: EMAIL_CONFIG.auth.user,
      to: "recipient@example.com",
      subject: `Scraping Results for ${data.product_title}`,
      text: JSON.stringify(data, null, 2)
    });
    console.log("Email sent successfully");
  } catch (error) {
    console.error("Error sending email:", error);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
