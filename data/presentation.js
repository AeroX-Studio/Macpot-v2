// Default merchandising only; custom catalog imagery remains editable in admin.
const images = {
  'macbook-air': '/images/macbook-air.png',
  'iphone-pro': '/images/iphone-pro.jpg',
  'ipad-air': '/images/ipad-air.png',
  'airpods-pro': '/images/airpods-pro.jpg',
};
const banners = [
  { id: 'banner-one', eyebrow: 'YOUR NEXT CHAPTER, UPGRADED', title: 'Less ordinary.\nMore possibility.', description: 'Beautifully made. Thoughtfully chosen. Discover Apple essentials for the way you work, create, and live.', note: 'MacBook Air · Ready for your next big idea', image: '/images/hero-macbook.png', alt: 'Two sky blue MacBook Air laptops showing their slim aluminum design', cta: 'Explore Mac', href: '/category/mac', active: true, sortOrder: 0 },
  { id: 'banner-two', eyebrow: 'A LITTLE MORE EXTRAORDINARY', title: 'Your world.\nIn a new light.', description: 'Make room for better moments. Find an iPhone that feels like you, with personal help choosing the right one.', note: 'iPhone Pro · A new perspective', image: '/images/iphone-pro.jpg', alt: 'iPhone Pro in a selection of finishes', cta: 'Explore iPhone', href: '/category/iphone', active: true, sortOrder: 1 },
  { id: 'banner-three', eyebrow: 'MAKE SPACE FOR YOURSELF', title: 'Less noise.\nMore you.', description: 'Your favourite album. A moment of focus. Discover the little essentials that make every day sound better.', note: 'AirPods Pro · Find your frequency', image: '/images/airpods-pro.jpg', alt: 'AirPods Pro with their charging case', cta: 'Explore audio', href: '/category/audio', active: true, sortOrder: 2 },
];
module.exports = { images, banners };
